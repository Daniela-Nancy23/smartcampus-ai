// US-01 Signaler · US-02 Suivre · US-03 Traiter
const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireRole } = require('../auth');
const { enregistrerPhoto, urlPhoto, cheminLocal } = require('../stockage');
const { ORDRE_PRIORITE_SQL, TRANSITIONS, PHOTO_MAX_OCTETS, PHOTO_TYPES } = require('../constants');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_MAX_OCTETS },
  fileFilter: (req, file, cb) => {
    if (PHOTO_TYPES[file.mimetype]) return cb(null, true);
    req.erreurPhoto = 'La photo doit être au format JPG ou PNG.'; // RG-02
    cb(null, false);
  },
});

function recevoirPhoto(req, res, next) {
  upload.single('photo')(req, res, err => {
    if (err && err.code === 'LIMIT_FILE_SIZE') req.erreurPhoto = 'La photo dépasse 10 Mo.'; // RG-02
    else if (err) return next(err);
    next();
  });
}

const SELECT_TICKET = `
  SELECT t.*, c.libelle AS categorie, l.batiment, l.salle,
         a.nom AS auteur_nom, tech.nom AS technicien_nom
  FROM ticket t
  JOIN categorie c ON c.id = t.categorie_id
  JOIN lieu l ON l.id = t.lieu_id
  JOIN utilisateur a ON a.id = t.auteur_id
  LEFT JOIN utilisateur tech ON tech.id = t.technicien_id`;

// RG-05 et RG-07 : qui peut voir un ticket
function peutVoir(user, t) {
  if (user.role === 'admin') return true;
  if (user.role === 'etudiant') return t.auteur_id === user.id;
  if (user.role === 'technicien') return t.technicien_id === user.id;
  return false;
}

async function referentiels() {
  const [categories, lieux] = await Promise.all([
    db.query('SELECT * FROM categorie ORDER BY id'),
    db.query('SELECT * FROM lieu ORDER BY batiment, salle'),
  ]);
  return { categories: categories.rows, lieux: lieux.rows };
}

// ---------- US-02 : mes demandes ----------
router.get('/mes-demandes', requireRole('etudiant'), async (req, res) => {
  const { rows } = await db.query(`${SELECT_TICKET} WHERE t.auteur_id = $1 ORDER BY t.maj_le DESC`, [req.user.id]);
  res.render('mes-demandes', { titre: 'Mes demandes', tickets: rows });
});

// ---------- US-01 : formulaire (pré-rempli par l'assistant pour US-05) ----------
router.get('/tickets/nouveau', requireRole('etudiant'), async (req, res) => {
  const ref = await referentiels();
  const valeurs = { description: req.query.description || '', categorie_id: '', lieu_id: '' };
  if (req.query.categorie) {
    const c = ref.categories.find(x => x.libelle === req.query.categorie);
    if (c) valeurs.categorie_id = String(c.id);
  }
  if (req.query.lieu) {
    const cherche = String(req.query.lieu).toLowerCase();
    const l = ref.lieux.find(x => cherche.includes(x.salle.toLowerCase()) || x.salle.toLowerCase().includes(cherche));
    if (l) valeurs.lieu_id = String(l.id);
  }
  res.render('nouveau-ticket', { titre: 'Signaler un incident', ...ref, valeurs, erreurs: {}, depuisAssistant: !!req.query.description });
});

// ---------- US-01 : création ----------
router.post('/tickets', requireRole('etudiant'), recevoirPhoto, async (req, res) => {
  const { categorie_id, lieu_id } = req.body;
  const description = (req.body.description || '').trim();
  const erreurs = {};
  // RG-01 : champs obligatoires
  if (!categorie_id) erreurs.categorie_id = 'Choisissez une catégorie.';
  if (!lieu_id) erreurs.lieu_id = 'Choisissez un lieu.';
  if (!description) erreurs.description = 'Décrivez le problème.';
  if (req.erreurPhoto) erreurs.photo = req.erreurPhoto;

  if (Object.keys(erreurs).length) {
    const ref = await referentiels();
    return res.status(400).render('nouveau-ticket', { titre: 'Signaler un incident', ...ref, valeurs: req.body, erreurs, depuisAssistant: false });
  }

  const cat = (await db.query('SELECT * FROM categorie WHERE id = $1', [categorie_id])).rows[0];
  if (!cat) return res.status(400).render('erreur', { titre: 'Catégorie inconnue', message: 'Catégorie invalide.' });

  let photoCle = null;
  if (req.file) photoCle = await enregistrerPhoto(req.file.buffer, PHOTO_TYPES[req.file.mimetype], req.file.mimetype);

  const client = await db.pool.connect();
  let ticket;
  try {
    await client.query('BEGIN');
    // RG-04 : statut « Nouveau » et priorité de la catégorie (RG-03 : Sécurité = Critique)
    const ins = await client.query(
      `INSERT INTO ticket (auteur_id, lieu_id, categorie_id, description, photo_cle, priorite)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [req.user.id, lieu_id, cat.id, description, photoCle, cat.priorite_defaut]);
    const id = ins.rows[0].id;
    const numero = `SC-${String(id).padStart(5, '0')}`;
    await client.query('UPDATE ticket SET numero = $1 WHERE id = $2', [numero, id]);
    await client.query(
      `INSERT INTO historique (ticket_id, auteur_id, nouveau_statut, commentaire) VALUES ($1, $2, 'Nouveau', 'Signalement créé')`,
      [id, req.user.id]);
    await client.query('COMMIT');
    ticket = { id, numero };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // RG-03 : alerte immédiate (MVP : journal serveur + tête de file ; SNS dans l'architecture cible)
  if (cat.libelle === 'Sécurité') console.warn(`[ALERTE SÉCURITÉ] Ticket ${ticket.numero} créé par ${req.user.nom}`);

  res.render('confirmation', { titre: 'Signalement envoyé', ticket, securite: cat.libelle === 'Sécurité' });
});

// ---------- US-02 : détail + historique ----------
router.get('/tickets/:id', requireRole(), async (req, res) => {
  const t = (await db.query(`${SELECT_TICKET} WHERE t.id = $1`, [req.params.id])).rows[0];
  if (!t) return res.status(404).render('erreur', { titre: 'Ticket introuvable', message: "Ce ticket n'existe pas." });
  if (!peutVoir(req.user, t)) {
    return res.status(403).render('erreur', { titre: 'Accès refusé (403)', message: "Vous ne pouvez consulter que vos propres demandes." });
  }
  const historique = (await db.query(
    `SELECT h.*, u.nom AS auteur_nom FROM historique h LEFT JOIN utilisateur u ON u.id = h.auteur_id
     WHERE h.ticket_id = $1 ORDER BY h.date, h.id`, [t.id])).rows;
  const photo = await urlPhoto(t.photo_cle, t.id);
  const techniciens = req.user.role === 'admin'
    ? (await db.query(`SELECT id, nom FROM utilisateur WHERE role = 'technicien' ORDER BY nom`)).rows : [];
  const peutModifier = req.user.role === 'admin' || (req.user.role === 'technicien' && t.technicien_id === req.user.id);
  res.render('ticket', {
    titre: `Ticket ${t.numero}`, t, historique, photo, techniciens,
    transitions: peutModifier ? TRANSITIONS[t.statut] : [],
    erreur: req.query.erreur || null,
  });
});

// Photo stockée en local (mode sans S3), servie seulement à qui peut voir le ticket
router.get('/tickets/:id/photo', requireRole(), async (req, res) => {
  const t = (await db.query('SELECT * FROM ticket WHERE id = $1', [req.params.id])).rows[0];
  if (!t || !t.photo_cle || !peutVoir(req.user, t)) return res.sendStatus(404);
  const fichier = cheminLocal(t.photo_cle);
  return fichier ? res.sendFile(fichier) : res.sendStatus(404);
});

// ---------- US-03 : changement de statut ----------
router.post('/tickets/:id/statut', requireRole('technicien', 'admin'), async (req, res) => {
  const t = (await db.query('SELECT * FROM ticket WHERE id = $1', [req.params.id])).rows[0];
  if (!t) return res.sendStatus(404);
  const retour = msg => res.redirect(`/tickets/${t.id}?erreur=${encodeURIComponent(msg)}`);

  // RG-07 : seul le technicien assigné ou un admin
  if (req.user.role === 'technicien' && t.technicien_id !== req.user.id) {
    return res.status(403).render('erreur', { titre: 'Accès refusé (403)', message: "Ce ticket n'est pas assigné à vous." });
  }
  const nouveau = req.body.statut;
  const commentaire = (req.body.commentaire || '').trim();
  if (!TRANSITIONS[t.statut].includes(nouveau)) return retour(`Passage de « ${t.statut} » à « ${nouveau} » non autorisé.`);
  // RG-08 : commentaire obligatoire pour « Résolu »
  if (nouveau === 'Résolu' && !commentaire) return retour('Un commentaire de résolution est obligatoire.');

  await db.query(
    `UPDATE ticket SET statut = $1, en_retard = FALSE, maj_le = now(),
            resolu_le = CASE WHEN $1 = 'Résolu' THEN now() ELSE resolu_le END
     WHERE id = $2`, [nouveau, t.id]);
  await db.query(
    `INSERT INTO historique (ticket_id, auteur_id, ancien_statut, nouveau_statut, commentaire) VALUES ($1, $2, $3, $4, $5)`,
    [t.id, req.user.id, t.statut, nouveau, commentaire || null]);
  res.redirect(`/tickets/${t.id}`);
});

// ---------- US-03 : file du technicien ----------
router.get('/file', requireRole('technicien'), async (req, res) => {
  const { rows } = await db.query(
    `${SELECT_TICKET} WHERE t.technicien_id = $1 AND t.statut <> 'Résolu'
     ORDER BY ${ORDRE_PRIORITE_SQL}, t.cree_le`, [req.user.id]);
  res.render('file', { titre: 'Ma file de tickets', tickets: rows });
});

module.exports = router;
