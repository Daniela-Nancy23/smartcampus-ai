# Checklist de tests (QE) — tirée des scénarios Gherkin

Comptes : `lea@campus.fr` (étudiante), `karim@campus.fr` (technicien), `sophie@campus.fr` (admin). Mot de passe : `demo1234`.

| # | US / règle | Étapes | Résultat attendu | OK ? |
|---|---|---|---|---|
| 1 | US-01 | Léa → Signaler → catégorie, lieu, description → Envoyer | Écran de confirmation avec un numéro SC-xxxxx, statut « Nouveau » | ☐ |
| 2 | RG-01 | Léa → Signaler → Envoyer sans rien remplir | Ticket non créé, 3 champs signalés en rouge | ☐ |
| 3 | RG-02 | Joindre un fichier .txt ou une image de plus de 10 Mo | Message d'erreur sur la photo, ticket non créé | ☐ |
| 4 | US-01 | Joindre une photo JPG/PNG | La photo s'affiche sur la page du ticket | ☐ |
| 5 | RG-03 | Signalement de catégorie « Sécurité » | Priorité « Critique », message d'alerte, ticket en tête des listes | ☐ |
| 6 | US-02 | Léa → Mes demandes → ouvrir un ticket | Statut, date de mise à jour et historique daté | ☐ |
| 7 | RG-05 | Léa ouvre l'URL d'un ticket de Tom (ex. `/tickets/2`) | Page « Accès refusé (403) » | ☐ |
| 8 | RG-06 | Léa → Mes demandes | Bandeau « pas pris en charge depuis plus de 24 h » (ticket de démo SC-00019) | ☐ |
| 9 | Admin | Sophie → Tickets → assigner un ticket à Karim, priorité Haute → OK | Le ticket apparaît dans la file de Karim ; l'historique indique l'assignation | ☐ |
| 10 | US-03 | Karim → Ma file | Tickets triés : Critique, Haute, Normale, puis par ancienneté | ☐ |
| 11 | RG-07 | Karim passe un ticket « Nouveau » directement à « Résolu » (impossible dans la liste) ; via l'API : refus | Seul « En cours » est proposé | ☐ |
| 12 | RG-08 | Karim : « En cours » → « Résolu » sans commentaire | Refus : « commentaire obligatoire » | ☐ |
| 13 | US-03 | Karim : « Résolu » avec commentaire | Léa voit le statut et le commentaire dans son historique | ☐ |
| 14 | RBAC | Karim ouvre `/admin/tickets` ; Léa ouvre `/admin/dashboard` | 403 dans les deux cas | ☐ |
| 15 | US-04 | Assistant : « Comment me connecter au Wi-Fi ? » | Réponse issue de la FAQ en moins de 5 s | ☐ |
| 16 | US-04 | Assistant : « Quel est le menu de demain ? » | L'assistant dit qu'il ne sait pas (pas de réponse inventée) | ☐ |
| 17 | US-05 | Léa : « Le Wi-Fi ne marche pas en B204 » → Créer un signalement | Formulaire pré-rempli : description, catégorie « Problème réseau », lieu B204 | ☐ |
| 18 | US-06 | Sophie → Tableau de bord → 7 jours / 30 jours / Semestre | Les indicateurs et graphiques changent avec la période | ☐ |
| 19 | Santé | Ouvrir `http://<IP>/sante` | `{"ok":true, ...}` avec le modèle Bedrock et le bucket S3 | ☐ |
