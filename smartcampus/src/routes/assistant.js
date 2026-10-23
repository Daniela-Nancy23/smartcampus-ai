// US-04 Interroger l'assistant · US-05 Créer un ticket depuis l'assistant
const express = require('express');
const { requireRole } = require('../auth');
const { repondre } = require('../assistant');

const router = express.Router();

// Initiales de l'utilisateur (max 2 lettres) pour l'avatar des bulles
function initialesDe(nom) {
  return String(nom || '').trim().split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
}

router.get('/assistant', requireRole(), (req, res) => {
  const prenom = (req.user.nom || '').split(' ')[0];
  res.render('assistant', { titre: 'Assistant du campus', prenom, initiales: initialesDe(req.user.nom) });
});

router.post('/api/assistant', requireRole(), async (req, res) => {
  const question = String(req.body.question || '').trim().slice(0, 500);
  if (!question) return res.status(400).json({ erreur: 'Question vide' });
  const debut = Date.now();
  const prenom = (req.user.nom || '').split(' ')[0];
  const r = await repondre(question, prenom);
  // US-05 : proposer un signalement pré-rempli si incident ou réponse introuvable (étudiants uniquement)
  let signalement = null;
  if (req.user.role === 'etudiant' && (r.incident || !r.trouve)) {
    const params = new URLSearchParams({ description: question });
    if (r.categorie) params.set('categorie', r.categorie);
    if (r.lieu) params.set('lieu', r.lieu);
    signalement = `/tickets/nouveau?${params}`;
  }
  res.json({ reponse: r.reponse, trouve: r.trouve, source: r.source, signalement, duree_ms: Date.now() - debut });
});

module.exports = router;
