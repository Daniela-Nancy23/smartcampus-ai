// Connexion à PostgreSQL (RDS en production, local en développement).
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  // RDS impose TLS ; le certificat AWS n'est pas dans le magasin par défaut de Node,
  // d'où rejectUnauthorized: false pour le MVP (à remplacer par le bundle CA RDS en production).
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
