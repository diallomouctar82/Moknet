<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/17i7decasi4wPDhsw79FfyT_6dRtWriW-

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Appels de groupe (audio / vidéo, experts, traduction, compte-rendu)

Démonstration multi-onglets (un onglet par personne) :
`http://localhost:3000/?view=calls&as=moussa`, `?view=calls&as=aminata`, `?view=calls&as=jeanpierre`.

Tests :

- `npm run typecheck`
- `npm test` — tests unitaires et d'intégration (vitest)
- `npm run test:e2e` — scénario navigateur réel « 3 personnes + 1 expert, audio puis vidéo » (Playwright)

Détails, scénario de recette et points bloquants avant production : [docs/APPELS_MULTI_PARTICIPANTS.md](docs/APPELS_MULTI_PARTICIPANTS.md).
