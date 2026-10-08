# Appels de groupe MokNet — audio, vidéo, experts, traduction, compte-rendu

Ce document décrit la fonctionnalité « Appels de groupe » : ce qu'elle fait, comment l'essayer,
comment elle est testée, et ce qui bloque encore la mise en production.

## 1. Ce que fait la fonctionnalité

| Besoin | Réalisation | Où |
|---|---|---|
| Démarrer un appel avec une personne, puis en ajouter d'autres sans raccrocher | Onglet **Appels de groupe** → *Nouvel appel* (audio ou vidéo) ; dans l'appel, bouton **« Ajouter un participant »** | `components/calls/CallsHub.tsx`, `MeetingRoom.tsx`, `InviteDialog.tsx` |
| L'invité accepte ou refuse | Bandeau d'invitation entrante avec **Accepter / Refuser** et choix de la langue d'écoute | `CallsHub.tsx` (`IncomingInvite`) |
| Audio **et** vidéo, passage de l'un à l'autre en cours d'appel | WebRTC pair-à-pair (maillage), bouton *Passer en vidéo / audio* | `services/meeting/mediaMesh.ts` |
| Inviter les experts MokNet avec une compétence de collaboration | Onglet *Experts MokNet* de l'ajout : **Conseiller** (répond quand on le sollicite), **Preneur de notes** et **Récap en direct** (silencieux, n'interrompent jamais) | `meetingCore.ts`, `expertEngine.ts`, `runtime.ts` |
| Multilingue : chacun choisit sa langue d'écoute | Sélecteurs *J'écoute en* / *Je parle* ; une traduction **par langue distincte** (pas par personne), avec cache, délai maximal et repli affiché | `languages.ts`, `translationRouter.ts` |
| Consignes des experts sans « français uniquement » | `BASE_INSTRUCTION` revue + `LANGUAGE_POLICY` ajoutée à **toutes** les consignes, y compris celles personnalisées dans l'admin ; profil *M. Diallo (logement)* corrigé (il recevait la consigne générique) | `services/geminiService.ts` |
| Espace partagé : tableau, récapitulatif, décisions, plan d'action | Panneau *Espace partagé*, modifiable par tous, **à l'écrit ou à la voix** (dictée + commandes « Décision : … », « Action : … pour Aminata avant vendredi », « Ligne : Ciment ; 3 ; 1500 », « Corrige décision 2 : … ») | `SharedWorkspace.tsx`, `commandParser.ts` |
| Informations incertaines signalées | ⚠️ automatique : hésitations (fr/en/es), nombres ambigus (« 1,500 »), calcul faux, contenu proposé par une IA non confirmé | `uncertainty.ts` |
| Calculs vérifiés par le logiciel | Arithmétique décimale exacte (bigint, sans flottants) ; colonnes calculées non modifiables à la main ; toute égalité écrite (« 3 x 1500 = 4000 ») est recalculée et corrigée | `calc.ts`, `workspace.ts` |
| Prise de notes annoncée et acceptée par tous | Annonce nominative (qui prend les notes, expert IA compris) ; **rien n'est conservé** tant que chaque présent n'a pas accepté ; un nouvel arrivant met en pause ; un refus annule ; des notes d'IA arrivées après un retrait sont jetées | `meetingCore.ts` (`recomputeConsent`) |
| Compte-rendu validé, conservé dans la conversation, visible des seules personnes autorisées | Proposé par un participant, validé par **chaque** présent (ou correction demandée), empreinte de contrôle, publié dans la conversation d'appel avec la liste des lecteurs autorisés | `report.ts`, `conversationStore.ts` |

### Règles métier principales (toutes testées)

- **Hôte de l'appel** : il applique les intentions de tous dans l'ordre et diffuse l'état. S'il part, le participant arrivé le plus tôt devient hôte ; l'appel continue.
- Un participant **ne peut agir qu'en son propre nom** ; les résultats d'IA ne peuvent être injectés que par l'hôte.
- **6 personnes maximum** par appel (limite du maillage WebRTC ; au-delà il faut un serveur média).
- Experts : toujours présentés comme **experts IA** dans un appel de groupe (consentement éclairé). Un conseiller ne reçoit la transcription que si la prise de notes a été acceptée par tous.
- Quelqu'un qui part **sans avoir validé** le compte-rendu n'y a pas accès ; un arrivant pendant la validation doit valider aussi.

### Langues réellement prises en charge (`services/meeting/languages.ts`)

| Langue | Sous-titres traduits | Dictée navigateur | Voix de l'expert (appel 1:1) |
|---|---|---|---|
| Français, English, Español, العربية | oui | oui | oui |
| Kiswahili | oui | oui | non |
| Wolof, Pulaar, Malinké, Lingala | **expérimental** (affiché comme tel) | non (saisie écrite) | non |

Ces niveaux reprennent les listes publiques des fournisseurs ; ils n'ont **pas** été mesurés avec une vraie clé Gemini (voir §4).

## 2. Essayer en local (démonstration multi-onglets)

```bash
npm install
npm run dev            # http://localhost:3000
```

Ouvrir un onglet par personne (même navigateur) :

- `http://localhost:3000/?view=calls&as=moussa`
- `http://localhost:3000/?view=calls&as=aminata`
- `http://localhost:3000/?view=calls&as=jeanpierre`

(profils de démonstration : `moussa`, `aminata`, `jeanpierre`, `fatou`, `kofi`). Les onglets
communiquent comme des appareils distincts (BroadcastChannel pour l'état, WebRTC pour l'audio/vidéo).

Sans `GEMINI_API_KEY` dans `.env.local`, l'interface l'indique clairement (« IA hors ligne ») :
la traduction est **simulée** (préfixe `[EN · simulé]`, ce n'est pas une traduction), le preneur de
notes fonctionne par règles (il ne reprend que ce qui a été dit) et le conseiller répond
« réponse indisponible » — il n'invente rien. Avec une clé, Gemini traduit et fait parler les experts.

Le bouton « Appel de groupe » (icône personnes) est aussi présent à côté du téléphone dans le chat des experts.

## 3. Tests

```bash
npm run typecheck      # TypeScript strict sur tout le dépôt
npm test               # 58 tests unitaires et d'intégration (vitest)
npm run test:e2e       # 2 scénarios navigateur réels (Playwright + Chromium)
```

### Scénario de recette « 3 personnes + 1 expert, audio puis vidéo »

`tests/e2e/multiParticipantCall.spec.ts` (navigateur réel) et `tests/unit/scenario.test.ts` (même
scénario, client par client, sur bus en mémoire) :

1. Moussa (écoute en français) démarre un **appel audio** avec Aminata ; Aminata reçoit l'invitation, choisit **l'anglais**, accepte.
2. **En cours d'appel**, Aminata clique « Ajouter un participant » et invite Jean-Pierre ; il voit l'invitation (Fatou, non invitée, ne voit rien), choisit **l'espagnol**, accepte. L'audio WebRTC est vérifié connecté entre les 3 onglets (3 paires).
3. Moussa invite **Maître Diallo comme preneur de notes** : l'annonce nominative s'affiche chez tous ; une phrase dite avant l'accord **n'est pas conservée** ; Aminata et Jean-Pierre acceptent → prise de notes active.
4. Chacun parle dans sa langue ; chacun lit les autres dans sa langue d'écoute (FR/EN/ES).
5. Le preneur de notes range la décision et l'action (responsable : Aminata K.), marquées ⚠️ jusqu'à confirmation par un humain.
6. Tableau *Devis* rempli à plusieurs (commande écrite et saisie) : le logiciel calcule 3 × 1 500 + 2 × 750,50 = **6 001** (6,001 chez Aminata), sans totaliser le prix unitaire. Jean-Pierre dicte « 3 x 1500 = 4000 » → **calcul faux signalé** ; Aminata corrige.
7. Jean-Pierre **passe l'appel en vidéo** : chaque onglet reçoit 2 flux vidéo distants réellement décodés (largeur > 0, lecture en cours).
8. Moussa propose le **compte-rendu** ; Aminata et Jean-Pierre valident ; il est publié dans la conversation.
9. Fin d'appel : le compte-rendu est visible des 3 participants ; **Fatou ne voit ni la conversation ni le compte-rendu**.

Second scénario : appel **vidéo d'emblée**, un **refus** d'invitation, un ajout en cours d'appel, un
conseiller IA interrogé (échec propre sans clé), et départ de l'hôte avec reprise par un autre participant.

Captures (si `E2E_SHOTS_DIR` est défini) et `evidence.json` (états WebRTC, texte du compte-rendu) sont produits par le scénario.

## 4. Ce qui est fait, testé en vrai, et bloqué avant production

### Fait et testé en vrai (navigateur Chromium réel, faux micro/caméra de Chromium)
- Invitations, acceptation/refus, ajout en cours d'appel, départ et reprise d'hôte, fin d'appel.
- Audio puis vidéo WebRTC réels entre 3 onglets (connexions `connected`, pistes audio/vidéo reçues, images décodées).
- Consentement à la prise de notes, rôles d'experts, espace partagé (voix simulée par saisie écrite), calculs, incertitudes, compte-rendu et contrôle d'affichage.
- Affichage téléphone (390 px) sans débordement horizontal.

### Testé seulement en simulation (niveau banc)
- **Traduction** : routage, cache, délai, repli → testés avec un traducteur factice ; **la qualité de traduction Gemini n'a pas été testée** (aucune clé dans l'environnement).
- **Experts IA Gemini** (réponses, notes, récap JSON) : code écrit, non exécuté contre l'API réelle.
- **Dictée vocale** (Web Speech API) : indisponible en navigateur automatisé ; les tests saisissent le texte à la place.

### Bloqué avant mise en production
1. **Serveur temps réel** : l'état et la signalisation passent par `BroadcastChannel`, qui ne relie que les onglets d'un même navigateur. Il faut un service WebSocket (ou équivalent) authentifié pour relier des appareils différents — l'interface `Bus` est prête à le recevoir.
2. **Serveur TURN** (et STUN maîtrisé) pour les réseaux mobiles/NAT stricts ; configurable via `VITE_ICE_SERVERS`.
3. **Contrôle d'accès côté serveur** : la restriction du compte-rendu est aujourd'hui un filtre d'affichage sur `localStorage`. Les comptes-rendus, conversations et l'état d'appel doivent être stockés et filtrés par le serveur (sinon toute personne ayant accès au navigateur peut lire les données brutes). L'état d'appel circule aussi chez un onglet non invité sur le bus de démonstration.
4. **Annuaire d'utilisateurs et authentification réels** : l'annuaire est de démonstration ; la connexion actuelle de l'application est simulée.
5. **Clé Gemini et appel serveur** : la clé est injectée dans le bundle navigateur (`process.env.API_KEY`, comportement existant). En production, les appels Gemini doivent passer par un serveur. Puis mesurer la qualité réelle de traduction, surtout pour wolof, pulaar, malinké, lingala.
6. **Décision juridique** sur la prise de notes et la traduction en direct (RGPD / lois locales) : le consentement de tous est exigé pour conserver ; les sous-titres en direct sont éphémères mais passent par le service de traduction — à valider.
7. **Persona « expert humain »** du chat individuel (consigne existante) : dans les appels de groupe, les experts sont présentés comme IA ; aligner ou non le chat 1:1 est une décision produit.
8. **Au-delà de 6 personnes** : serveur média (SFU) nécessaire.
9. **Dépôt ForgeJo** : le travail a été poussé sur le dépôt GitHub accessible depuis cette session ; il doit être poussé ou mis en miroir vers ForgeJo.
