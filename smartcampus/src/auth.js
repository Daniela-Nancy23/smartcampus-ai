// Authentification par JWT (cookie httpOnly) et contrôle des rôles (RBAC).
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const COOKIE = 'sc_token';
const DUREE = '8h';

function secret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET manquant dans .env');
  return process.env.JWT_SECRET;
}

async function verifierIdentifiants(email, motDePasse) {
  const { rows } = await db.query('SELECT * FROM utilisateur WHERE lower(email) = lower($1)', [email]);
  const u = rows[0];
  if (!u) return null;
  const ok = await bcrypt.compare(motDePasse, u.mot_de_passe_hash);
  return ok ? { id: u.id, nom: u.nom, email: u.email, role: u.role } : null;
}

function connecter(res, user) {
  const token = jwt.sign(user, secret(), { expiresIn: DUREE });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600 * 1000 });
}

function deconnecter(res) {
  res.clearCookie(COOKIE);
}

// Lit le JWT à chaque requête et expose l'utilisateur aux vues.
function chargerUtilisateur(req, res, next) {
  const token = req.cookies[COOKIE];
  req.user = null;
  if (token) {
    try {
      const { id, nom, email, role } = jwt.verify(token, secret());
      req.user = { id, nom, email, role };
    } catch (e) {
      res.clearCookie(COOKIE);
    }
  }
  res.locals.user = req.user;
  next();
}

// requireRole('admin'), requireRole('technicien', 'admin'), requireRole() = simplement connecté
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ erreur: 'Non connecté' });
      return res.redirect('/login');
    }
    if (roles.length && !roles.includes(req.user.role)) {
      if (req.originalUrl.startsWith('/api/')) return res.status(403).json({ erreur: 'Accès refusé' });
      return res.status(403).render('erreur', { titre: 'Accès refusé (403)', message: "Votre rôle ne permet pas d'accéder à cette page." });
    }
    next();
  };
}

module.exports = { verifierIdentifiants, connecter, deconnecter, chargerUtilisateur, requireRole };
