-- SmartCampus AI – schéma PostgreSQL (5 tables)
-- Rejouable : supprime puis recrée les tables.

DROP TABLE IF EXISTS historique;
DROP TABLE IF EXISTS ticket;
DROP TABLE IF EXISTS categorie;
DROP TABLE IF EXISTS lieu;
DROP TABLE IF EXISTS utilisateur;

CREATE TABLE utilisateur (
  id                SERIAL PRIMARY KEY,
  nom               TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  mot_de_passe_hash TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('etudiant', 'technicien', 'admin'))
);

CREATE TABLE lieu (
  id        SERIAL PRIMARY KEY,
  batiment  TEXT NOT NULL,
  salle     TEXT NOT NULL,
  UNIQUE (batiment, salle)
);

CREATE TABLE categorie (
  id               SERIAL PRIMARY KEY,
  libelle          TEXT NOT NULL UNIQUE,
  priorite_defaut  TEXT NOT NULL CHECK (priorite_defaut IN ('Basse', 'Normale', 'Haute', 'Critique'))
);

CREATE TABLE ticket (
  id             SERIAL PRIMARY KEY,
  numero         TEXT UNIQUE,
  auteur_id      INT  NOT NULL REFERENCES utilisateur(id),
  lieu_id        INT  NOT NULL REFERENCES lieu(id),
  categorie_id   INT  NOT NULL REFERENCES categorie(id),
  description    TEXT NOT NULL,
  photo_cle      TEXT,
  statut         TEXT NOT NULL DEFAULT 'Nouveau' CHECK (statut IN ('Nouveau', 'En cours', 'Résolu')),
  priorite       TEXT NOT NULL CHECK (priorite IN ('Basse', 'Normale', 'Haute', 'Critique')),
  technicien_id  INT  REFERENCES utilisateur(id),
  en_retard      BOOLEAN NOT NULL DEFAULT FALSE,
  cree_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
  maj_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolu_le      TIMESTAMPTZ
);

CREATE INDEX ticket_auteur_idx     ON ticket (auteur_id);
CREATE INDEX ticket_technicien_idx ON ticket (technicien_id);
CREATE INDEX ticket_cree_le_idx    ON ticket (cree_le);

CREATE TABLE historique (
  id              SERIAL PRIMARY KEY,
  ticket_id       INT  NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  auteur_id       INT  REFERENCES utilisateur(id),      -- NULL = action automatique (tâche 24 h)
  ancien_statut   TEXT,
  nouveau_statut  TEXT,
  commentaire     TEXT,
  date            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX historique_ticket_idx ON historique (ticket_id);
