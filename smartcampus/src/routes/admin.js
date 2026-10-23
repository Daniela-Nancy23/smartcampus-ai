// Administration : assignation des tickets et tableau de bord (US-06)
const express = require('express');
const db = require('../db');
const { requireRole } = require('../auth');
const { ORDRE_PRIORITE_SQL, PRIORITES } = require('../constants');

const router = express.Router();
router.use('/admin', requireRole('admin'));

// Tous les tickets, filtrables par statut
router.get('/admin/tickets', async (req, res) => {
  const filtre = req.query.statut || 'ouverts';
  const where = filtre === 'tous' ? '' : filtre === 'ouverts' ? `WHERE t.statut <> 'Résolu'` : 'WHERE t.statut = $1';
  const params = ['tous', 'ouverts'].includes(filtre) ? [] : [filtre];
  const [tickets, techniciens, agr] = await Promise.all([
    db.query(`
      SELECT t.*, c.libelle AS categorie, l.batiment, l.salle, a.nom AS auteur_nom, tech.nom AS technicien_nom
      FROM ticket t JOIN categorie c ON c.id = t.categorie_id JOIN lieu l ON l.id = t.lieu_id
      JOIN utilisateur a ON a.id = t.auteur_id LEFT JOIN utilisateur tech ON tech.id = t.technicien_id
      ${where} ORDER BY ${ORDRE_PRIORITE_SQL}, t.cree_le`, params),
    db.query(`SELECT id, nom FROM utilisateur WHERE role = 'technicien' ORDER BY nom`),
    // Compteurs par statut (une seule requête agrégée) pour les pilules de filtre
    db.query(`SELECT
                count(*)::int AS tous,
                count(*) FILTER (WHERE statut <> 'Résolu')::int AS ouverts,
                count(*) FILTER (WHERE statut = 'Nouveau')::int AS nouveau,
                count(*) FILTER (WHERE statut = 'En cours')::int AS en_cours,
                count(*) FILTER (WHERE statut = 'Résolu')::int AS resolu
              FROM ticket`),
  ]);
  const a = agr.rows[0];
  const compteurs = { ouverts: a.ouverts, 'Nouveau': a.nouveau, 'En cours': a.en_cours, 'Résolu': a.resolu, tous: a.tous };
  res.render('admin-tickets', { titre: 'Tous les tickets', tickets: tickets.rows, techniciens: techniciens.rows, filtre, PRIORITES, compteurs });
});

// Assigner un technicien et/ou changer la priorité
router.post('/admin/tickets/:id/assigner', async (req, res) => {
  const t = (await db.query('SELECT t.*, u.nom AS technicien_nom FROM ticket t LEFT JOIN utilisateur u ON u.id = t.technicien_id WHERE t.id = $1', [req.params.id])).rows[0];
  if (!t) return res.sendStatus(404);
  const technicienId = req.body.technicien_id ? Number(req.body.technicien_id) : null;
  const priorite = PRIORITES.includes(req.body.priorite) ? req.body.priorite : t.priorite;

  let tech = null;
  if (technicienId) {
    tech = (await db.query(`SELECT id, nom FROM utilisateur WHERE id = $1 AND role = 'technicien'`, [technicienId])).rows[0];
    if (!tech) return res.status(400).render('erreur', { titre: 'Technicien inconnu', message: "Ce technicien n'existe pas." });
  }
  await db.query('UPDATE ticket SET technicien_id = $1, priorite = $2, maj_le = now() WHERE id = $3', [technicienId, priorite, t.id]);

  const changements = [];
  if (technicienId !== t.technicien_id) changements.push(tech ? `Assigné à ${tech.nom}` : 'Assignation retirée');
  if (priorite !== t.priorite) changements.push(`Priorité : ${t.priorite} → ${priorite}`);
  if (changements.length) {
    await db.query(`INSERT INTO historique (ticket_id, auteur_id, commentaire) VALUES ($1, $2, $3)`, [t.id, req.user.id, changements.join(' · ')]);
  }
  res.redirect(req.body.retour === 'ticket' ? `/tickets/${t.id}` : '/admin/tickets');
});

// ---------- US-06 : tableau de bord ----------
const PERIODES = { semaine: '7 days', mois: '30 days', semestre: '182 days' };

router.get('/admin/dashboard', async (req, res) => {
  const periode = PERIODES[req.query.periode] ? req.query.periode : 'mois';
  const p = [PERIODES[periode]];
  const filtre = `t.cree_le >= now() - $1::interval`;
  const [parCategorie, parLieu, parStatut, kpi] = await Promise.all([
    db.query(`SELECT c.libelle AS label, count(*)::int AS n FROM ticket t JOIN categorie c ON c.id = t.categorie_id
              WHERE ${filtre} GROUP BY c.libelle ORDER BY n DESC`, p),
    db.query(`SELECT l.batiment || ' · ' || l.salle AS label, count(*)::int AS n FROM ticket t JOIN lieu l ON l.id = t.lieu_id
              WHERE ${filtre} GROUP BY 1 ORDER BY n DESC LIMIT 8`, p),
    db.query(`SELECT t.statut AS label, count(*)::int AS n FROM ticket t WHERE ${filtre} GROUP BY t.statut
              ORDER BY CASE t.statut WHEN 'Nouveau' THEN 1 WHEN 'En cours' THEN 2 ELSE 3 END`, p),
    // RG-11 : délai = résolution − création, sur les tickets résolus uniquement
    db.query(`SELECT count(*)::int AS total,
                     count(*) FILTER (WHERE t.en_retard AND t.statut = 'Nouveau')::int AS en_retard,
                     count(*) FILTER (WHERE c.libelle = 'Sécurité')::int AS securite,
                     round((avg(extract(epoch FROM t.resolu_le - t.cree_le)) FILTER (WHERE t.resolu_le IS NOT NULL) / 3600)::numeric, 1) AS delai_h
              FROM ticket t JOIN categorie c ON c.id = t.categorie_id WHERE ${filtre}`, p),
  ]);
  res.render('dashboard', {
    titre: 'Tableau de bord', periode,
    kpi: kpi.rows[0],
    data: { categories: parCategorie.rows, lieux: parLieu.rows, statuts: parStatut.rows },
  });
});

module.exports = router;
