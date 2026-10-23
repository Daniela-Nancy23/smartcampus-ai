// Tâche planifiée (RG-06) : toutes les heures, les tickets restés « Nouveau »
// depuis plus de 24 h passent « en retard » et l'étudiant voit une notification.
const cron = require('node-cron');
const db = require('./db');

async function marquerTicketsEnRetard() {
  const { rows } = await db.query(`
    UPDATE ticket SET en_retard = TRUE, maj_le = now()
    WHERE statut = 'Nouveau' AND en_retard = FALSE AND cree_le < now() - interval '24 hours'
    RETURNING id`);
  for (const r of rows) {
    await db.query(
      `INSERT INTO historique (ticket_id, auteur_id, ancien_statut, nouveau_statut, commentaire)
       VALUES ($1, NULL, 'Nouveau', 'Nouveau', 'Relance automatique : pas de prise en charge sous 24 h. L''équipe a été notifiée.')`,
      [r.id]);
  }
  if (rows.length) console.log(`[tâche 24 h] ${rows.length} ticket(s) passé(s) en retard`);
  return rows.length;
}

function demarrer() {
  marquerTicketsEnRetard().catch(e => console.error('[tâche 24 h]', e.message));
  cron.schedule('0 * * * *', () => marquerTicketsEnRetard().catch(e => console.error('[tâche 24 h]', e.message)));
}

module.exports = { demarrer, marquerTicketsEnRetard };
