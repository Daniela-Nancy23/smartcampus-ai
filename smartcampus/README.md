# SmartCampus AI – MVP

Signalement et suivi des incidents du campus, traitement par les techniciens, assistant IA (Amazon Bedrock) et tableau de bord pour l'administration.

**Architecture** : 1 instance EC2 (Node.js 20 + Express, dans Docker) · Amazon RDS PostgreSQL (non public) · Amazon S3 (photos, bucket privé) · Amazon Bedrock (assistant, FAQ dans le prompt) · 1 rôle IAM. Région **us-west-2**.

## Comptes de démo

Mot de passe pour tous : `demo1234`

| Compte | Rôle | Écran d'accueil |
|---|---|---|
| `lea@campus.fr` | Étudiante | Mes demandes |
| `tom@campus.fr`, `ines@campus.fr` | Étudiants | Mes demandes |
| `karim@campus.fr`, `nadia@campus.fr` | Techniciens | Ma file |
| `sophie@campus.fr` | Admin | Tous les tickets, Tableau de bord |

## Ce qui est couvert

| US / règle | Où | Route |
|---|---|---|
| US-01 Signaler (RG-01 champs obligatoires, RG-02 photo, RG-03 sécurité = critique, RG-04 statut initial) | `src/routes/tickets.js` | `GET /tickets/nouveau`, `POST /tickets` |
| US-02 Suivre (RG-05 seulement ses tickets) | `src/routes/tickets.js` | `GET /mes-demandes`, `GET /tickets/:id` |
| US-03 Traiter (RG-07 transitions et droits, RG-08 commentaire obligatoire) | `src/routes/tickets.js` | `GET /file`, `POST /tickets/:id/statut` |
| Assignation et priorité (admin) | `src/routes/admin.js` | `GET /admin/tickets`, `POST /admin/tickets/:id/assigner` |
| US-04 Assistant IA (RG-09 pas de réponse inventée) | `src/assistant.js`, `src/faq.js` | `GET /assistant`, `POST /api/assistant` |
| US-05 Signalement depuis l'assistant (RG-10 validation par l'étudiant) | `src/routes/assistant.js` | lien vers `/tickets/nouveau?description=…` |
| US-06 Tableau de bord (RG-11 délai de résolution, RG-12 admin uniquement) | `src/routes/admin.js` | `GET /admin/dashboard?periode=semaine\|mois\|semestre` |
| RG-06 Relance 24 h | `src/jobs.js` (toutes les heures) | badge « En retard » |
| Rôles (JWT dans un cookie httpOnly) | `src/auth.js` | `requireRole('admin')`… |

La FAQ de `src/faq.js` est un **exemple** : le BA la remplace par les vraies informations du campus.

## Déploiement sur AWS (≈ 45 min)

### 1. RDS PostgreSQL — à lancer en premier (10 à 15 min de création)

Console RDS → Créer une base de données :
- Moteur **PostgreSQL**, modèle **Offre gratuite / Dev-Test**, classe **db.t4g.micro**, une seule zone.
- Identifiant maître : `smartcampus`, mot de passe : à noter.
- **Accès public : Non**, VPC par défaut.
- Groupe de sécurité : créer **`sg-db`**.
- Configuration supplémentaire → **Nom de la base initiale : `smartcampus`**.

### 2. Bucket S3

Console S3 → Créer un compartiment en **us-west-2**, nom unique (ex. `smartcampus-photos-groupe1`), **« Bloquer tout l'accès public » coché**.

### 3. Rôle IAM de l'EC2

Console IAM → Rôles → Créer → Service **EC2** → Créer une stratégie avec le contenu de `aws/iam-policy.json` (remplacer `NOM-DU-BUCKET` et `ID-DU-COMPTE`).
Si le compte du lab refuse une stratégie fine, utiliser temporairement `"Resource": "*"` pour Bedrock et le noter comme dette.

### 4. Accès au modèle Bedrock

Console Bedrock (us-west-2) → Accès aux modèles → vérifier que **Amazon Nova Lite** est disponible / activé.

### 5. Instance EC2

- AMI **Amazon Linux 2023**, type **t3.small**, paire de clés pour le SSH.
- Groupe de sécurité **`sg-web`** : HTTP 80 depuis `0.0.0.0/0`, SSH 22 depuis **Mon IP**.
- Détails avancés → **Profil d'instance IAM** : le rôle de l'étape 3. **Métadonnées : limite de sauts de réponse = 2** (nécessaire pour que Docker récupère les droits du rôle).

Puis retourner sur **`sg-db`** → Règle entrante : PostgreSQL 5432, **source = `sg-web`** (le groupe, pas une IP).

### 6. Installation sur l'EC2

```bash
ssh -i ma-cle.pem ec2-user@<IP-PUBLIQUE>

sudo dnf install -y docker git
sudo systemctl enable --now docker

# Récupérer le projet (git clone, ou scp -r depuis votre PC)
git clone <URL-DU-DEPOT> smartcampus && cd smartcampus

# Configurer
cp .env.example .env
nano .env        # PGHOST = point de terminaison RDS, PGPASSWORD, S3_BUCKET, JWT_SECRET (openssl rand -hex 32)

# Construire, initialiser la base (⚠ efface les données), lancer
sudo docker build -t smartcampus .
sudo docker run --rm --env-file .env smartcampus node scripts/init-db.js
sudo docker run -d --name smartcampus --restart unless-stopped -p 80:3000 --env-file .env smartcampus
```

Vérifier : `curl http://localhost/sante` → `{"ok":true,"base":"ok","bedrock":"us.amazon.nova-lite-v1:0","s3":"<bucket>"}`, puis ouvrir `http://<IP-PUBLIQUE>` depuis un téléphone.

Mettre à jour après un changement de code :

```bash
git pull && sudo docker build -t smartcampus . && sudo docker rm -f smartcampus \
  && sudo docker run -d --name smartcampus --restart unless-stopped -p 80:3000 --env-file .env smartcampus
sudo docker logs -f smartcampus     # journaux (alertes sécurité, tâche 24 h, erreurs Bedrock)
```

### Tester Bedrock seul depuis l'EC2

```bash
aws bedrock-runtime converse --region us-west-2 --model-id us.amazon.nova-lite-v1:0 \
  --messages '[{"role":"user","content":[{"text":"Bonjour"}]}]'
```

## Développement en local (sans AWS)

```bash
npm install
cp .env.example .env    # PGHOST=127.0.0.1, PGSSL=false, S3_BUCKET= (vide), BEDROCK_MODEL_ID= (vide)
npm run init-db
npm run dev             # http://localhost:3000
```

Sans `S3_BUCKET`, les photos vont dans `uploads/`. Sans `BEDROCK_MODEL_ID` (ou si Bedrock échoue), l'assistant passe en **plan B : recherche par mots-clés** dans la FAQ.

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `/sante` → erreur de connexion à la base | `sg-db` n'autorise pas `sg-web`, ou mauvais `PGHOST` | Vérifier la règle 5432 source `sg-web` et le point de terminaison RDS |
| `no pg_hba.conf entry … no encryption` | TLS désactivé | `PGSSL=true` |
| Assistant toujours en mode mots-clés | Accès au modèle, rôle IAM ou limite de sauts | `docker logs smartcampus` ; tester la commande `aws bedrock-runtime converse` ; limite de sauts des métadonnées = 2 |
| `AccessDenied` sur S3 | Nom du bucket dans la stratégie IAM | Corriger `NOM-DU-BUCKET` dans la stratégie |
| Page inaccessible depuis l'extérieur | Port 80 fermé | Règle HTTP 80 `0.0.0.0/0` dans `sg-web` |

## À la fin de l'atelier

Supprimer l'instance EC2, la base RDS (sans instantané final) et vider puis supprimer le bucket S3 : RDS et EC2 sont facturés à l'heure.

## Structure

```
src/server.js          serveur Express, connexion, santé
src/auth.js            JWT, bcrypt, requireRole
src/db.js              connexion PostgreSQL
src/routes/tickets.js  US-01, US-02, US-03
src/routes/admin.js    assignation, US-06
src/routes/assistant.js US-04, US-05
src/assistant.js       Bedrock (API Converse) + plan B mots-clés
src/faq.js             FAQ de l'assistant (exemple)
src/stockage.js        photos : S3 ou dossier local
src/jobs.js            tâche 24 h (node-cron)
sql/schema.sql         5 tables
scripts/init-db.js     tables + données de démo
views/                 écrans EJS
aws/iam-policy.json    stratégie IAM du rôle EC2
TESTS.md               checklist de tests du QE
```
