const STATUTS = ['Nouveau', 'En cours', 'Résolu'];
const PRIORITES = ['Basse', 'Normale', 'Haute', 'Critique'];
// Ordre SQL : Critique d'abord (file du technicien, RG : tri par priorité puis date)
const ORDRE_PRIORITE_SQL = `CASE t.priorite WHEN 'Critique' THEN 1 WHEN 'Haute' THEN 2 WHEN 'Normale' THEN 3 ELSE 4 END`;
// RG-07 : transitions autorisées
const TRANSITIONS = { 'Nouveau': ['En cours'], 'En cours': ['Résolu'], 'Résolu': [] };
const PHOTO_MAX_OCTETS = 10 * 1024 * 1024; // RG-02 : 10 Mo
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' };

module.exports = { STATUTS, PRIORITES, ORDRE_PRIORITE_SQL, TRANSITIONS, PHOTO_MAX_OCTETS, PHOTO_TYPES };
