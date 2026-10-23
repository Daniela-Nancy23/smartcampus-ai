// Photos : Amazon S3 (bucket privé + liens signés) si S3_BUCKET est défini,
// sinon dossier local uploads/ (développement, ou plan B).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DOSSIER_LOCAL = path.join(__dirname, '..', 'uploads');
const bucket = () => process.env.S3_BUCKET;

let s3 = null;
function client() {
  if (!s3) {
    const { S3Client } = require('@aws-sdk/client-s3');
    s3 = new S3Client({ region: process.env.AWS_REGION || 'us-west-2' });
  }
  return s3;
}

async function enregistrerPhoto(buffer, extension, mimetype) {
  const cle = `photos/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${extension}`;
  if (bucket()) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await client().send(new PutObjectCommand({ Bucket: bucket(), Key: cle, Body: buffer, ContentType: mimetype }));
  } else {
    const fichier = path.join(DOSSIER_LOCAL, cle);
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    fs.writeFileSync(fichier, buffer);
  }
  return cle;
}

// URL d'affichage : lien signé S3 valable 5 minutes, ou route locale protégée.
async function urlPhoto(cle, ticketId) {
  if (!cle) return null;
  if (bucket()) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: cle }), { expiresIn: 300 });
  }
  return `/tickets/${ticketId}/photo`;
}

function cheminLocal(cle) {
  const fichier = path.normalize(path.join(DOSSIER_LOCAL, cle));
  if (!fichier.startsWith(DOSSIER_LOCAL)) return null; // pas de sortie du dossier
  return fs.existsSync(fichier) ? fichier : null;
}

module.exports = { enregistrerPhoto, urlPhoto, cheminLocal };
