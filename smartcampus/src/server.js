// SmartCampus AI – serveur Express (front + API)
require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const db = require('./db');
const auth = require('./auth');
const jobs = require('./jobs');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.disable('x-powered-by');

app.use(express.static(path.join(__dirname, '..', 'public')));
// Chart.js servi localement (pas de dépendance à un CDN pendant la démo)
app.use('/vendor/chart.js', express.static(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(auth.chargerUtilisateur);

// Helpers d'affichage disponibles dans toutes les vues
app.locals.fmt = d => d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '';
app.locals.slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '-');

// Santé (pour vérifier le déploiement et la connexion à RDS)
app.get('/sante', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, base: 'ok', bedrock: process.env.BEDROCK_MODEL_ID || 'mode mots-clés', s3: process.env.S3_BUCKET || 'local' });
  } catch (e) {
    res.status(500).json({ ok: false, base: e.message });
  }
});

// Page de présentation publique (accessible avec ou sans connexion)
app.get('/accueil', (req, res) => res.render('accueil', { titre: 'Présentation' }));

// Connexion
app.get('/login', (req, res) => res.render('login', { titre: 'Connexion', erreur: null, email: '' }));
app.post('/login', async (req, res) => {
  const user = await auth.verifierIdentifiants(req.body.email || '', req.body.mot_de_passe || '');
  if (!user) return res.status(401).render('login', { titre: 'Connexion', erreur: 'E-mail ou mot de passe incorrect.', email: req.body.email || '' });
  auth.connecter(res, user);
  res.redirect('/');
});
app.post('/logout', (req, res) => { auth.deconnecter(res); res.redirect('/login'); });

// Racine : visiteur non connecté -> page de présentation ;
// connecté -> chaque rôle arrive sur son écran principal.
app.get('/', (req, res) => {
  if (!req.user) return res.redirect('/accueil');
  const accueil = { etudiant: '/mes-demandes', technicien: '/file', admin: '/admin/tickets' };
  res.redirect(accueil[req.user.role]);
});

app.use(require('./routes/tickets'));
app.use(require('./routes/assistant'));
app.use(require('./routes/admin'));

// 404 et erreurs
app.use((req, res) => res.status(404).render('erreur', { titre: 'Page introuvable', message: "Cette page n'existe pas." }));
app.use((err, req, res, next) => {
  console.error(err);
  if (req.originalUrl.startsWith('/api/')) return res.status(500).json({ erreur: 'Erreur serveur' });
  res.status(500).render('erreur', { titre: 'Erreur serveur', message: 'Une erreur est survenue. Réessayez dans un instant.' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`SmartCampus AI démarré sur le port ${port}`);
  jobs.demarrer();
});
