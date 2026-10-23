// Assistant IA (US-04) : Amazon Bedrock (API Converse) avec la FAQ dans le prompt.
// Plan B automatique : recherche par mots-clés si Bedrock n'est pas configuré ou échoue.
const FAQ = require('./faq');

const CATEGORIES = ['Salle fermée', 'Matériel défectueux', 'Problème réseau', 'Sécurité', 'Autre'];

const faqTexte = FAQ.map((f, i) => `Q${i + 1}. ${f.q}\nR${i + 1}. ${f.r}`).join('\n\n');

const PROMPT_SYSTEME = `Tu es l'assistant du campus SmartCampus AI. Tu réponds en français, en 3 phrases maximum, de façon claire et polie.
Règles strictes :
- Tu réponds UNIQUEMENT à partir de la FAQ ci-dessous. N'invente jamais d'information (horaires, lieux, numéros, procédures).
- Si la réponse n'est pas dans la FAQ, dis que tu ne sais pas et propose de faire un signalement.
- Si l'utilisateur décrit un incident sur le campus (panne, salle fermée, matériel cassé, réseau, sécurité), indique-le.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme :
{"reponse": "...", "trouve": true|false, "incident": true|false, "categorie": "${CATEGORIES.join('" | "')}" | null, "lieu": "salle ou bâtiment cité, sinon null"}

FAQ :
${faqTexte}`;

let client = null;
function bedrock() {
  if (!client) {
    const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
    client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-west-2',
      maxAttempts: 2,
      // US-04 : réponse en moins de 5 s visée ; au-delà de 10 s on bascule sur le plan B
      requestHandler: { connectionTimeout: 3000, requestTimeout: 10000 },
    });
  }
  return client;
}

function extraireJson(texte) {
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut === -1 || fin === -1) return null;
  try { return JSON.parse(texte.slice(debut, fin + 1)); } catch { return null; }
}

async function demanderBedrock(question, prenom) {
  const { ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
  // Personnalisation : on ajoute le prénom au prompt sans modifier les règles existantes.
  const systeme = prenom
    ? `${PROMPT_SYSTEME}\n\nL'utilisateur s'appelle ${prenom}, tu peux l'appeler par son prénom.`
    : PROMPT_SYSTEME;
  const sortie = await bedrock().send(new ConverseCommand({
    modelId: process.env.BEDROCK_MODEL_ID,
    system: [{ text: systeme }],
    messages: [{ role: 'user', content: [{ text: question }] }],
    inferenceConfig: { maxTokens: 400, temperature: 0.2 },
  }));
  const texte = (sortie.output?.message?.content || []).map(c => c.text || '').join('');
  const json = extraireJson(texte);
  if (json && typeof json.reponse === 'string') return { ...json, source: 'bedrock' };
  // Le modèle n'a pas respecté le format : on renvoie son texte brut.
  return { reponse: texte.trim(), trouve: true, incident: false, categorie: null, lieu: null, source: 'bedrock' };
}

// --- Plan B : mots-clés ---
const MOTS_VIDES = new Set('le la les un une des de du d l à a au aux et ou en est je j me mon ma mes on il ce ça que qui quoi comment quel quelle quels quelles pour sur dans par pas ne plus faire fait y a-t-il est-ce'.split(' '));
const normaliser = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
// Racine grossière (5 lettres) : « connecte » et « connecter » se rejoignent ; « Wi-Fi » devient « wifi »
const mots = s => [...new Set(normaliser(s.replace(/wi[\s-]?fi/gi, 'wifi')).split(/\s+/)
  .filter(m => m.length > 2 && !MOTS_VIDES.has(m)).map(m => m.slice(0, 5)))];

// Salle citée dans la question (B204, A12, amphi C…) pour pré-remplir le lieu du signalement
function detecterLieu(question) {
  const code = question.match(/\b([A-Ca-c]\s?\d{2,3})\b/);
  if (code) return code[1].replace(/\s/, '').toUpperCase();
  const t = normaliser(question);
  if (/amphi\s?c\b/.test(t)) return 'Amphi C';
  if (/biblio/.test(t)) return 'Salle de lecture';
  if (/cafet/.test(t)) return 'Cafétéria';
  if (/parking/.test(t)) return 'Parking P2';
  return null;
}

function detecterIncident(question) {
  const t = normaliser(question);
  if (/(securite|forcee|alarme|suspect|agression|vol |incendie|fumee)/.test(t)) return 'Sécurité';
  if (/(wifi|wi fi|reseau|internet|connexion)/.test(t) && /(marche pas|fonctionne pas|panne|coupe|lent|plus de)/.test(t)) return 'Problème réseau';
  if (/(ferme|fermee|verrouill|porte)/.test(t) && /(salle|amphi|porte)/.test(t)) return 'Salle fermée';
  if (/(casse|panne|marche pas|fonctionne pas|defectueu|allume pas|ne s allume)/.test(t)) return 'Matériel défectueux';
  return null;
}

function repondreMotsCles(question) {
  const q = new Set(mots(question));
  let meilleur = null, score = 0;
  let ratio = 0;
  for (const f of FAQ) {
    const cles = mots(f.q);
    const s = cles.filter(m => q.has(m)).length;
    if (s > score) { score = s; meilleur = f; ratio = s / cles.length; }
  }
  const categorie = detecterIncident(question);
  const lieu = detecterLieu(question);
  // Trouvé si au moins 2 mots communs, ou la moitié des mots-clés d'une question courte de la FAQ
  if (meilleur && (score >= 2 || ratio >= 0.5)) {
    return { reponse: meilleur.r, trouve: true, incident: !!categorie, categorie, lieu, source: 'mots-cles' };
  }
  return {
    reponse: categorie
      ? "Cela ressemble à un incident sur le campus : faites un signalement, un technicien le prendra en charge."
      : "Je ne trouve pas la réponse dans la FAQ du campus. Vous pouvez faire un signalement pour qu'un membre de l'équipe vous réponde.",
    trouve: false, incident: !!categorie, categorie, lieu, source: 'mots-cles',
  };
}

async function repondre(question, prenom) {
  if (process.env.BEDROCK_MODEL_ID) {
    try {
      return await demanderBedrock(question, prenom);
    } catch (e) {
      console.error('[assistant] Bedrock indisponible, bascule en mode mots-clés :', e.name, e.message);
    }
  }
  // Plan B (mots-clés) inchangé : le prénom n'y est pas utilisé.
  return repondreMotsCles(question);
}

module.exports = { repondre, repondreMotsCles, CATEGORIES };
