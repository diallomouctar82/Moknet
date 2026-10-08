// Scénario de recette en navigateur réel (Chromium) : trois personnes et un
// expert dans le même appel, en audio puis en vidéo, avec ajout en cours
// d'appel, traduction, prise de notes consentie et compte-rendu partagé.
//
// Chaque personne a son propre onglet ; les onglets communiquent comme des
// appareils distincts (BroadcastChannel + WebRTC). Micro et caméra sont
// simulés par Chromium (--use-fake-device-for-media-stream) : les flux audio
// et vidéo sont réels, leur contenu est synthétique.

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SHOTS = process.env.E2E_SHOTS_DIR || 'test-results/scenario';
const TAILWIND = process.env.E2E_TAILWIND_CSS; // CSS précompilé (facultatif) : le CDN Tailwind peut être inaccessible

const norm = (s: string | null) => (s ?? '').replace(/[  ]/g, ' ').trim();

async function newContext(browser: any): Promise<BrowserContext> {
  const context: BrowserContext = await browser.newContext({ permissions: ['microphone', 'camera'] });
  await context.addInitScript(() => localStorage.setItem('mok_auth_token', 'e2e'));
  const css = TAILWIND && existsSync(TAILWIND) ? readFileSync(TAILWIND, 'utf8') : '';
  await context.route('https://cdn.tailwindcss.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.tailwind = {}; ${css ? `document.head.appendChild(Object.assign(document.createElement('style'), { textContent: ${JSON.stringify(css)} }));` : ''}`,
  }));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ status: 200, body: '' }));
  return context;
}

async function openAs(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  page.on('pageerror', e => console.log(`[${id}] pageerror`, e.message));
  await page.goto(`/?view=calls&as=${id}`);
  await expect(page.getByTestId('calls-hub')).toHaveAttribute('data-identity', id);
  return page;
}

const diag = (p: Page) => p.evaluate(() => (window as any).__moknetCallDiagnostics?.());

async function expectMediaConnected(p: Page, peers: number, kind: 'audio' | 'video') {
  await expect.poll(async () => {
    const d = await diag(p);
    if (!d) return 'pas de diagnostic';
    const ok = d.media.filter((m: any) => m.connectionState === 'connected' && m.remoteAudioTracks >= 1 && (kind === 'audio' || m.remoteVideoTracks >= 1));
    return ok.length;
  }, { timeout: 30_000, message: `connexions ${kind} établies` }).toBe(peers);
}

/** Vérifie que des images vidéo distantes sont réellement décodées (largeur > 0, lecture en cours). */
async function expectRemoteVideoPlaying(p: Page, peerIds: string[]) {
  for (const id of peerIds) {
    await expect.poll(() => p.evaluate((pid) => {
      const v = document.querySelector(`[data-testid="media-${pid}"]`) as HTMLVideoElement | null;
      return v && v.tagName === 'VIDEO' ? { w: v.videoWidth, playing: !v.paused && v.readyState >= 2 } : null;
    }, id), { timeout: 30_000, message: `vidéo de ${id}` }).toMatchObject({ w: expect.any(Number), playing: true });
    const w = await p.evaluate((pid) => (document.querySelector(`[data-testid="media-${pid}"]`) as HTMLVideoElement).videoWidth, id);
    expect(w).toBeGreaterThan(0);
  }
}

async function speak(p: Page, text: string) {
  await p.getByTestId('speak-input').fill(text);
  await p.getByTestId('speak-send').click();
}

async function command(p: Page, text: string) {
  await p.getByTestId('ws-command').fill(text);
  await p.getByTestId('ws-command-send').click();
}

const shot = async (p: Page, name: string, focus?: string) => {
  mkdirSync(SHOTS, { recursive: true });
  // Le défilement se fait dans le conteneur de l'application, pas dans la fenêtre.
  if (focus) await p.locator(focus).first().evaluate(el => el.scrollIntoView({ block: 'start' }));
  else await p.getByTestId('calls-hub').evaluate(el => el.scrollTo(0, 0));
  await p.screenshot({ path: join(SHOTS, `${name}.png`) });
};

test('3 personnes + 1 expert : audio puis vidéo, ajout en cours d\'appel, traduction, notes consenties, compte-rendu partagé', async ({ browser }) => {
  const evidence: Record<string, unknown> = { startedAt: new Date().toISOString() };
  const context = await newContext(browser);
  const moussa = await openAs(context, 'moussa');       // écoute en français
  const aminata = await openAs(context, 'aminata');     // écoutera en anglais
  const jp = await openAs(context, 'jeanpierre');       // écoutera en espagnol
  const fatou = await openAs(context, 'fatou');         // jamais invitée

  // 1. Moussa démarre un appel AUDIO avec Aminata.
  await moussa.getByTestId('new-call-mode-audio').click();
  await moussa.getByTestId('new-call-title').fill('Chantier Kaloum');
  await moussa.getByTestId('new-call-first').selectOption('aminata');
  await moussa.getByTestId('start-call').click();
  await expect(moussa.getByTestId('meeting-room')).toHaveAttribute('data-mode', 'audio');
  evidence.aiMode = await moussa.getByTestId('ai-mode').textContent();

  await expect(aminata.getByTestId('incoming-invite')).toBeVisible();
  await shot(aminata, '01-invitation-recue');
  await aminata.getByTestId('invite-listen-lang').selectOption('en');
  await aminata.getByTestId('invite-accept').click();
  await expect(aminata.getByTestId('meeting-room')).toBeVisible();

  // 2. En cours d'appel, Aminata ajoute Jean-Pierre (bouton « Ajouter un participant »).
  await aminata.getByTestId('add-participant').click();
  await aminata.getByTestId('invite-person-jeanpierre').click();
  await expect(jp.getByTestId('incoming-invite')).toBeVisible();
  await expect(moussa.getByTestId('tile-jeanpierre')).toHaveAttribute('data-status', 'invited');
  await expect(fatou.getByTestId('incoming-invite')).toHaveCount(0);
  await jp.getByTestId('invite-listen-lang').selectOption('es');
  await jp.getByTestId('invite-accept').click();
  await expect(jp.getByTestId('meeting-room')).toBeVisible();
  await expect(moussa.getByTestId('tile-jeanpierre')).toHaveAttribute('data-status', 'joined');

  // Audio réel entre les trois onglets (maillage WebRTC).
  for (const p of [moussa, aminata, jp]) await expectMediaConnected(p, 2, 'audio');
  evidence.audio = { moussa: (await diag(moussa)).media, aminata: (await diag(aminata)).media, jeanpierre: (await diag(jp)).media };

  // 3. Moussa invite Maître Diallo comme preneur de notes : annonce et accord de chacun.
  await moussa.getByTestId('add-participant').click();
  await moussa.getByTestId('invite-tab-experts').click();
  await moussa.getByTestId('invite-expert-role').selectOption('NOTE_TAKER');
  await moussa.getByTestId('invite-expert-MAITRE').click();
  await expect(moussa.getByTestId('notes-status')).toHaveAttribute('data-status', 'requested');
  await speak(moussa, 'Avant accord : ceci ne doit pas être noté.');
  for (const p of [aminata, jp]) await expect(p.getByTestId('consent-banner')).toContainText('Maître Diallo (expert IA');
  await shot(jp, '02-annonce-prise-de-notes');
  await aminata.getByTestId('consent-accept').click();
  await jp.getByTestId('consent-accept').click();
  for (const p of [moussa, aminata, jp]) await expect(p.getByTestId('notes-status')).toHaveAttribute('data-status', 'active');

  // 4. Conversation multilingue : chacun lit les autres dans sa langue d'écoute.
  await speak(moussa, 'On a décidé de commencer lundi');
  await speak(aminata, 'Aminata will send the quote before Friday');
  await speak(jp, 'De acuerdo');
  const lastCaption = (p: Page, speaker: string) => p.locator(`[data-testid="caption"][data-speaker="${speaker}"] [data-testid="caption-text"]`).last();
  await expect(lastCaption(aminata, 'moussa')).toContainText('On a décidé de commencer lundi');
  await expect(lastCaption(aminata, 'moussa')).toContainText('[EN');
  await expect(lastCaption(jp, 'moussa')).toContainText('[ES');
  await expect(lastCaption(moussa, 'aminata')).toContainText('[FR');
  await expect(lastCaption(moussa, 'jeanpierre')).toContainText('[FR');
  await expect(lastCaption(aminata, 'aminata')).toHaveText('Aminata will send the quote before Friday');
  await shot(aminata, '03-sous-titres-traduits-en', '[aria-label="Sous-titres traduits"]');

  // 5. Le preneur de notes (sans IA ici, par règles) range décision et action, marquées à confirmer.
  await moussa.getByTestId('ws-tab-decisions').click();
  const expertDecision = moussa.locator('[data-testid="ws-item"][data-section="decisions"]', { hasText: 'commencer lundi' });
  await expect(expertDecision).toHaveAttribute('data-uncertain', 'true');
  await expect(moussa.locator('[data-testid="ws-item"]', { hasText: 'Avant accord' })).toHaveCount(0);
  await expertDecision.getByTestId('ws-confirm').click();
  await expect(expertDecision).toHaveAttribute('data-uncertain', 'false');
  await moussa.getByTestId('ws-tab-actions').click();
  const expertAction = moussa.locator('[data-testid="ws-item"][data-section="actions"]').first();
  await expect(expertAction).toContainText('Aminata K.');
  await expertAction.getByTestId('ws-confirm').click();

  // 6. Espace partagé : tableau calculé par le logiciel, saisi à plusieurs (texte et commande).
  await moussa.getByTestId('ws-tab-table').click();
  await moussa.getByTestId('table-preset-quote').click();
  await command(aminata, 'Ligne : Cement ; 3 ; 1 500');
  await jp.getByTestId('ws-tab-table').click();
  await jp.getByTestId('row-input-Article').fill('Arena');
  await jp.getByTestId('row-input-Quantité').fill('2');
  await jp.getByTestId('row-input-Prix unitaire').fill('750,50');
  await jp.getByTestId('row-add').click();
  await expect.poll(async () => norm(await moussa.getByTestId('table-total-Montant').textContent())).toBe('6 001');
  await expect(moussa.getByTestId('table-total-Prix unitaire')).toHaveText('—');
  await aminata.getByTestId('ws-tab-table').click();
  await expect.poll(async () => norm(await aminata.getByTestId('table-total-Montant').textContent())).toBe('6,001');

  // Calcul faux dicté par Jean-Pierre → signalé par le logiciel, corrigé par Aminata.
  await command(jp, 'Récap : Presupuesto total 3 x 1500 = 4000');
  await jp.getByTestId('ws-tab-recap').click();
  await expect(jp.locator('[data-testid="calc-check"]').first()).toHaveAttribute('data-ok', 'false');
  await aminata.getByTestId('ws-tab-recap').click();
  await shot(aminata, '04-calcul-faux-signale', '[aria-label="Espace partagé"]');
  await command(aminata, 'Corrige récap 1 : Total budget 3 x 1500 = 4500');
  await expect(jp.locator('[data-testid="calc-check"]').first()).toHaveAttribute('data-ok', 'true');

  // 7. Passage en VIDÉO en cours d'appel, sans raccrocher.
  await jp.getByTestId('switch-mode').click();
  for (const p of [moussa, aminata, jp]) await expect(p.getByTestId('meeting-room')).toHaveAttribute('data-mode', 'video');
  for (const p of [moussa, aminata, jp]) await expectMediaConnected(p, 2, 'video');
  await expectRemoteVideoPlaying(moussa, ['aminata', 'jeanpierre']);
  await expectRemoteVideoPlaying(aminata, ['moussa', 'jeanpierre']);
  await expectRemoteVideoPlaying(jp, ['moussa', 'aminata']);
  evidence.video = { moussa: (await diag(moussa)).media, aminata: (await diag(aminata)).media, jeanpierre: (await diag(jp)).media };
  await shot(moussa, '05-appel-video-3-personnes-1-expert');

  // 8. Compte-rendu : proposé par Moussa, validé par chacun, enregistré dans la conversation.
  await moussa.getByTestId('ws-tab-report').click();
  await moussa.getByTestId('report-propose').click();
  await expect(moussa.getByTestId('report-text')).toContainText('Maître Diallo');
  await expect(moussa.getByTestId('report-text')).toContainText('Total budget 3 x 1500 = 4500');
  for (const p of [aminata, jp]) {
    await p.getByTestId('ws-tab-report').click();
    await p.getByTestId('report-approve').click();
  }
  for (const p of [moussa, aminata, jp]) await expect(p.getByTestId('report-validated')).toBeVisible();
  const reportText = await moussa.getByTestId('report-text').textContent();
  evidence.report = reportText;
  await shot(jp, '06-compte-rendu-valide', '[aria-label="Espace partagé"]');

  // 9. Fin de l'appel ; le compte-rendu reste dans la conversation, visible des seuls participants.
  await moussa.getByTestId('end-call').click();
  for (const p of [moussa, aminata, jp]) {
    await expect(p.getByTestId('meeting-room')).toHaveCount(0);
    await expect(p.getByTestId('report-message')).toHaveCount(1);
  }
  await aminata.getByTestId('report-message').locator('button').click();
  await expect(aminata.getByTestId('report-message-text')).toContainText('## Participants');
  await shot(aminata, '07-conversation-compte-rendu');
  await fatou.reload();
  await expect(fatou.getByTestId('calls-hub')).toBeVisible();
  await expect(fatou.getByTestId('conversation')).toHaveCount(0);
  await expect(fatou.getByTestId('report-message')).toHaveCount(0);
  await shot(fatou, '08-fatou-non-autorisee');

  evidence.finishedAt = new Date().toISOString();
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(join(SHOTS, 'evidence.json'), JSON.stringify(evidence, null, 2));
  await context.close();
});

test('vidéo d\'emblée : un participant refuse, un autre est ajouté en cours d\'appel', async ({ browser }) => {
  const context = await newContext(browser);
  const kofi = await openAs(context, 'kofi');
  const fatou = await openAs(context, 'fatou');
  const moussa = await openAs(context, 'moussa');

  await kofi.getByTestId('new-call-mode-video').click();
  await kofi.getByTestId('new-call-first').selectOption('fatou');
  await kofi.getByTestId('start-call').click();
  await expect(fatou.getByTestId('incoming-invite')).toContainText('vidéo');
  await fatou.getByTestId('invite-decline').click();
  await expect(kofi.getByTestId('call-log')).toContainText('Fatou S. a refusé l\'invitation');

  await kofi.getByTestId('add-participant').click();
  await kofi.getByTestId('invite-person-moussa').click();
  await moussa.getByTestId('invite-accept').click();
  await expect(moussa.getByTestId('meeting-room')).toHaveAttribute('data-mode', 'video');
  await expectMediaConnected(kofi, 1, 'video');
  await expectMediaConnected(moussa, 1, 'video');
  await expectRemoteVideoPlaying(moussa, ['kofi']);

  // Un conseiller IA rejoint : sans clé Gemini, sa réponse échoue proprement (aucune réponse inventée).
  await kofi.getByTestId('add-participant').click();
  await kofi.getByTestId('invite-tab-experts').click();
  await kofi.getByTestId('invite-expert-role').selectOption('ADVISOR');
  await kofi.getByTestId('invite-expert-CONSEILLER').click();
  await expect(moussa.getByTestId('tile-expert:CONSEILLER')).toBeVisible();
  await expect(moussa.getByTestId('notes-status')).toHaveAttribute('data-status', 'off');
  await moussa.getByTestId('ask-expert-input').fill('Faut-il un contrat écrit ?');
  await moussa.getByTestId('ask-expert-send').click();
  const aiMode = await moussa.getByTestId('ai-mode').textContent();
  if (aiMode?.includes('hors ligne')) {
    await expect(moussa.getByTestId('expert-answer')).toHaveAttribute('data-status', 'failed');
  } else {
    await expect(moussa.getByTestId('expert-answer')).toHaveAttribute('data-status', 'answered', { timeout: 30_000 });
  }

  // L'hôte quitte : l'appel continue avec Moussa comme hôte.
  await kofi.getByTestId('leave-call').click();
  await expect(moussa.getByTestId('end-call')).toBeVisible();
  await context.close();
});
