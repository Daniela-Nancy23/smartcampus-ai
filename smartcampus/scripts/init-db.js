// Crée les tables et insère les données de démo (comptes, lieux, catégories, ~25 tickets).
// Usage : npm run init-db   (⚠ efface les données existantes)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../src/db');

const MOT_DE_PASSE_DEMO = 'demo1234';

const UTILISATEURS = [
  ['Léa Martin', 'lea@campus.fr', 'etudiant'],
  ['Tom Bernard', 'tom@campus.fr', 'etudiant'],
  ['Inès Dubois', 'ines@campus.fr', 'etudiant'],
  ['Karim Benali', 'karim@campus.fr', 'technicien'],
  ['Nadia Roux', 'nadia@campus.fr', 'technicien'],
  ['Sophie Laurent', 'sophie@campus.fr', 'admin'],
];
const LIEUX = [
  ['Bâtiment A', 'Accueil'], ['Bâtiment A', 'A12'], ['Bâtiment A', 'A105'],
  ['Bâtiment B', 'B204'], ['Bâtiment B', 'B310'], ['Bâtiment C', 'Amphi C'],
  ['Bibliothèque', 'Salle de lecture'], ['Cafétéria', 'Cafétéria'], ['Extérieur', 'Parking P2'],
];
const CATEGORIES = [
  ['Salle fermée', 'Normale'], ['Matériel défectueux', 'Normale'], ['Problème réseau', 'Haute'],
  ['Sécurité', 'Critique'], ['Autre', 'Basse'],
];

// [auteur, lieu(salle), catégorie, description, statut, technicien, âge en heures, durée de résolution en heures]
const TICKETS = [
  ['lea', 'B204', 'Matériel défectueux', "Le vidéoprojecteur ne s'allume pas.", 'Résolu', 'karim', 2400, 20],
  ['tom', 'A12', 'Problème réseau', 'Pas de Wi-Fi dans la salle depuis ce matin.', 'Résolu', 'karim', 2000, 6],
  ['ines', 'Amphi C', 'Salle fermée', "L'amphi est fermé à clé alors qu'on a cours à 8h.", 'Résolu', 'nadia', 1700, 2],
  ['lea', 'Salle de lecture', 'Problème réseau', 'Wi-Fi très lent à la bibliothèque.', 'Résolu', 'karim', 1500, 30],
  ['tom', 'Cafétéria', 'Matériel défectueux', 'Le micro-ondes de droite ne chauffe plus.', 'Résolu', 'nadia', 1200, 48],
  ['ines', 'A105', 'Matériel défectueux', 'Trois prises électriques ne fonctionnent pas.', 'Résolu', 'nadia', 900, 26],
  ['lea', 'Parking P2', 'Sécurité', 'La barrière du parking reste ouverte en permanence.', 'Résolu', 'karim', 700, 3],
  ['tom', 'B204', 'Problème réseau', 'Le Wi-Fi coupe toutes les 10 minutes.', 'Résolu', 'karim', 500, 12],
  ['ines', 'B310', 'Salle fermée', 'Salle B310 fermée pendant le créneau réservé.', 'Résolu', 'nadia', 400, 1],
  ['lea', 'A12', 'Problème réseau', 'Aucune connexion filaire sur les postes du fond.', 'Résolu', 'karim', 300, 18],
  ['tom', 'Amphi C', 'Matériel défectueux', 'Le micro sans fil grésille.', 'Résolu', 'nadia', 200, 22],
  ['ines', 'Salle de lecture', 'Autre', 'Le chauffage est trop fort.', 'Résolu', 'nadia', 150, 40],
  ['lea', 'B204', 'Matériel défectueux', "L'écran du poste enseignant est noir.", 'Résolu', 'karim', 120, 8],
  ['tom', 'Accueil', 'Sécurité', 'Porte de secours bloquée par des cartons.', 'Résolu', 'karim', 96, 1],
  ['ines', 'A12', 'Problème réseau', 'Wi-Fi inaccessible pendant le TP.', 'Résolu', 'karim', 80, 5],
  ['lea', 'B310', 'Matériel défectueux', 'Le tableau interactif ne répond plus au stylet.', 'En cours', 'karim', 70, null],
  ['tom', 'Cafétéria', 'Autre', "Fuite d'eau sous l'évier.", 'En cours', 'nadia', 50, null],
  ['ines', 'B204', 'Problème réseau', 'Le Wi-Fi ne marche pas en B204.', 'En cours', 'karim', 30, null],
  ['lea', 'A105', 'Salle fermée', 'La salle A105 est fermée, cours de 14h.', 'Nouveau', null, 30, null],   // > 24 h : en retard
  ['tom', 'Amphi C', 'Matériel défectueux', 'Deux sièges cassés au rang 4.', 'Nouveau', 'nadia', 28, null], // > 24 h : en retard
  ['ines', 'Parking P2', 'Sécurité', 'Éclairage du parking en panne, zone très sombre.', 'Nouveau', 'karim', 3, null],
  ['lea', 'A12', 'Matériel défectueux', 'La souris du poste 7 ne fonctionne pas.', 'Nouveau', null, 5, null],
  ['tom', 'Salle de lecture', 'Problème réseau', 'Impossible de se connecter au Wi-Fi.', 'Nouveau', 'karim', 2, null],
  ['ines', 'B310', 'Autre', 'Store bloqué en position basse.', 'Nouveau', null, 1, null],
];

async function main() {
  console.log('Création des tables…');
  await db.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8'));

  const hash = await bcrypt.hash(MOT_DE_PASSE_DEMO, 10);
  const users = {};
  for (const [nom, email, role] of UTILISATEURS) {
    const r = await db.query('INSERT INTO utilisateur (nom, email, mot_de_passe_hash, role) VALUES ($1,$2,$3,$4) RETURNING id', [nom, email, hash, role]);
    users[email.split('@')[0]] = r.rows[0].id;
  }
  const lieux = {};
  for (const [batiment, salle] of LIEUX) {
    lieux[salle] = (await db.query('INSERT INTO lieu (batiment, salle) VALUES ($1,$2) RETURNING id', [batiment, salle])).rows[0].id;
  }
  const cats = {};
  for (const [libelle, prio] of CATEGORIES) {
    cats[libelle] = { id: (await db.query('INSERT INTO categorie (libelle, priorite_defaut) VALUES ($1,$2) RETURNING id', [libelle, prio])).rows[0].id, prio };
  }

  const heure = 3600 * 1000;
  for (const [auteur, salle, cat, description, statut, tech, ageH, dureeH] of TICKETS) {
    const cree = new Date(Date.now() - ageH * heure);
    const resolu = statut === 'Résolu' ? new Date(cree.getTime() + dureeH * heure) : null;
    const priseEnCharge = new Date(cree.getTime() + Math.min(ageH - 0.5, (dureeH || 4) / 2) * heure);
    const r = await db.query(
      `INSERT INTO ticket (auteur_id, lieu_id, categorie_id, description, statut, priorite, technicien_id, cree_le, maj_le, resolu_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [users[auteur], lieux[salle], cats[cat].id, description, statut, cats[cat].prio, tech ? users[tech] : null,
       cree, resolu || (statut === 'En cours' ? priseEnCharge : cree), resolu]);
    const id = r.rows[0].id;
    await db.query('UPDATE ticket SET numero = $1 WHERE id = $2', [`SC-${String(id).padStart(5, '0')}`, id]);
    await db.query(`INSERT INTO historique (ticket_id, auteur_id, nouveau_statut, commentaire, date) VALUES ($1,$2,'Nouveau','Signalement créé',$3)`, [id, users[auteur], cree]);
    if (tech) await db.query(`INSERT INTO historique (ticket_id, auteur_id, commentaire, date) VALUES ($1,$2,$3,$4)`, [id, users.sophie, `Assigné à ${UTILISATEURS.find(u => u[1].startsWith(tech + '@'))[0]}`, new Date(cree.getTime() + 0.25 * heure)]);
    if (statut !== 'Nouveau') await db.query(`INSERT INTO historique (ticket_id, auteur_id, ancien_statut, nouveau_statut, commentaire, date) VALUES ($1,$2,'Nouveau','En cours','Prise en charge',$3)`, [id, users[tech], priseEnCharge]);
    if (statut === 'Résolu') await db.query(`INSERT INTO historique (ticket_id, auteur_id, ancien_statut, nouveau_statut, commentaire, date) VALUES ($1,$2,'En cours','Résolu','Intervention terminée, problème réglé.',$3)`, [id, users[tech], resolu]);
  }
  console.log(`OK : ${UTILISATEURS.length} comptes (mot de passe « ${MOT_DE_PASSE_DEMO} »), ${LIEUX.length} lieux, ${CATEGORIES.length} catégories, ${TICKETS.length} tickets.`);
  await db.pool.end();
}

main().catch(e => { console.error('Échec :', e.message); process.exit(1); });
