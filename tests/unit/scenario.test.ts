// Scénario de recette : trois personnes et un expert dans le même appel,
// en audio puis en vidéo, avec ajout en cours d'appel, traduction, prise de
// notes consentie, espace partagé et compte-rendu partagé.
// Chaque participant a son propre client ; ils ne communiquent que par le bus.

import { describe, it, expect } from 'vitest';
import { MemoryHub } from '../../services/meeting/bus';
import { MeetingClient } from '../../services/meeting/meetingClient';
import { ConversationStore, MemoryStorage } from '../../services/meeting/conversationStore';
import { expertParticipantId } from '../../services/meeting/meetingCore';
import { computeTable } from '../../services/meeting/workspace';
import { ExpertType } from '../../types';
import { FakeExpertEngine, FakeTranslator } from './helpers';

const MAITRE = expertParticipantId(ExpertType.MAITRE);

const setupWorld = () => {
  const hub = new MemoryHub();
  const storage = new MemoryStorage();              // simule le stockage serveur partagé
  const translator = new FakeTranslator();
  const engine = new FakeExpertEngine();
  const logs: Array<{ event: string; data: any }> = [];
  const mk = (id: string, name: string, lang: any) => new MeetingClient({
    bus: hub.endpoint(), me: { id, name, lang }, translator, expertEngine: engine,
    store: new ConversationStore(storage), onLog: (event, data) => logs.push({ event, data }),
  });
  const moussa = mk('moussa', 'Moussa D.', 'fr');
  const aminata = mk('aminata', 'Aminata K.', 'en');
  const jp = mk('jeanpierre', 'Jean-Pierre M.', 'es');
  const fatou = mk('fatou', 'Fatou S.', 'wo');      // jamais invitée : ne doit rien voir
  const all = [moussa, aminata, jp, fatou];
  const settle = async () => { for (let i = 0; i < 3; i++) for (const c of all) await c.settle(); };
  return { hub, storage, translator, engine, logs, moussa, aminata, jp, fatou, all, settle };
};

const runScenario = async (mode: 'audio' | 'video', switchToVideo = false) => {
  const w = setupWorld();
  const { moussa, aminata, jp, fatou, settle } = w;

  // 1. Moussa appelle Aminata.
  const call = moussa.startCall({ mode, title: 'Chantier Kaloum' });
  const id = call.id;
  await moussa.dispatch(id, { type: 'INVITE_PERSON', by: 'moussa', person: aminata.me });
  await settle();
  expect(aminata.incomingInvitations().map(m => m.id)).toEqual([id]);
  await aminata.dispatch(id, { type: 'RESPOND_INVITE', userId: 'aminata', accept: true });
  await aminata.dispatch(id, { type: 'SET_LANG', userId: 'aminata', listenLang: 'en', speakLang: 'en' });

  // 2. En cours d'appel, Aminata ajoute Jean-Pierre (sans raccrocher), qui accepte.
  await aminata.dispatch(id, { type: 'INVITE_PERSON', by: 'aminata', person: jp.me });
  await settle();
  expect(jp.incomingInvitations()).toHaveLength(1);
  expect(fatou.incomingInvitations()).toHaveLength(0);
  await jp.dispatch(id, { type: 'RESPOND_INVITE', userId: 'jeanpierre', accept: true });

  // 3. Moussa invite Maître Diallo comme preneur de notes : annonce + accord de chacun.
  await moussa.dispatch(id, { type: 'INVITE_EXPERT', by: 'moussa', expertType: ExpertType.MAITRE, role: 'NOTE_TAKER' });
  await settle();
  expect(jp.get(id)!.noteTaking.announcement).toContain('Maître Diallo (expert IA');
  await moussa.dispatch(id, { type: 'UTTERANCE', userId: 'moussa', text: 'Avant accord : rien ne doit être noté.' });
  await aminata.dispatch(id, { type: 'CONSENT', userId: 'aminata', accept: true });
  await jp.dispatch(id, { type: 'CONSENT', userId: 'jeanpierre', accept: true });
  await settle();
  expect(moussa.get(id)!.noteTaking.status).toBe('active');
  expect(moussa.get(id)!.transcript).toHaveLength(0);

  // 4. Un expert conseiller rejoint aussi ; Jean-Pierre l'interroge dans sa langue.
  await jp.dispatch(id, { type: 'INVITE_EXPERT', by: 'jeanpierre', expertType: ExpertType.CONSEILLER, role: 'ADVISOR' });
  await jp.dispatch(id, { type: 'ASK_EXPERT', by: 'jeanpierre', expertId: expertParticipantId(ExpertType.CONSEILLER), question: '¿Necesitamos un contrato?' });

  if (switchToVideo) await aminata.dispatch(id, { type: 'SET_MODE', by: 'aminata', mode: 'video' });

  // 5. Conversation multilingue : chacun reçoit les sous-titres dans sa langue.
  await moussa.dispatch(id, { type: 'UTTERANCE', userId: 'moussa', text: 'On a décidé de commencer lundi' });
  await aminata.dispatch(id, { type: 'UTTERANCE', userId: 'aminata', text: 'Aminata will send the quote before Friday' });
  await jp.dispatch(id, { type: 'UTTERANCE', userId: 'jeanpierre', text: 'De acuerdo' });
  await settle();

  // 6. Espace partagé : tableau calculé par le logiciel + décision écrite à la voix.
  await moussa.dispatch(id, { type: 'WS_TABLE_SETUP', by: 'moussa', title: 'Devis matériaux', columns: [
    { name: 'Article', type: 'text' }, { name: 'Quantité', type: 'number' }, { name: 'Prix', type: 'number' },
    { name: 'Montant', type: 'computed', formula: '{Quantité} * {Prix}' },
  ] });
  await aminata.dispatch(id, { type: 'WS_TABLE_ADD_ROW', by: 'aminata', cells: { Article: 'Cement', Quantité: '3', Prix: '1 500' } });
  await jp.dispatch(id, { type: 'WS_TABLE_ADD_ROW', by: 'jeanpierre', cells: { Article: 'Arena', Quantité: '2', Prix: '750,50' } });
  await jp.dispatch(id, { type: 'WS_ADD_ITEM', by: 'jeanpierre', section: 'recap', text: 'Presupuesto total 3 x 1500 = 4000', via: 'voice' });
  await settle();
  return { ...w, id };
};

describe('Scénario 3 personnes + expert', () => {
  it('audio : ajout en cours d\'appel, traduction, prise de notes consentie, compte-rendu partagé', async () => {
    const w = await runScenario('audio');
    const { moussa, aminata, jp, fatou, id, translator, engine, settle } = w;
    const st = moussa.get(id)!;

    // Tous voient le même état, et le même nombre de participants.
    for (const c of [aminata, jp]) expect(c.get(id)!.version).toBe(st.version);
    expect(st.mode).toBe('audio');
    expect(st.participants.filter(p => p.kind === 'human' && p.status === 'joined').map(p => p.id).sort()).toEqual(['aminata', 'jeanpierre', 'moussa']);
    expect(st.participants.filter(p => p.kind === 'expert').map(p => p.expertRole).sort()).toEqual(['ADVISOR', 'NOTE_TAKER']);

    // Traduction : une requête par langue d'écoute distincte, aucune vers la langue source.
    const cap = st.captions.find(c => c.text === 'On a décidé de commencer lundi')!;
    expect(cap.translations).toEqual({ en: { status: 'ok', text: '[en] On a décidé de commencer lundi', experimental: false }, es: { status: 'ok', text: '[es] On a décidé de commencer lundi', experimental: false } });
    expect(translator.calls.every(c => c.from !== c.to)).toBe(true);

    // L'expert conseiller répond dans la langue de celui qui demande, puis la réponse est traduite pour les autres.
    const answer = st.expertMessages[0];
    expect(answer).toMatchObject({ status: 'answered', lang: 'es' });
    expect(answer.answer).toContain('(es)');
    const expertCap = st.captions.find(c => c.kind === 'expert')!;
    expect(Object.keys(expertCap.translations).sort()).toEqual(['en', 'fr']);

    // Prise de notes : seules les interventions faites après l'accord de tous sont dans la transcription.
    expect(st.transcript.map(c => c.text)).not.toContain('Avant accord : rien ne doit être noté.');
    expect(st.transcript).toHaveLength(3);
    const notes = st.workspace.items.filter(i => i.authorId === MAITRE);
    expect(notes.map(n => n.section).sort()).toEqual(['actions', 'decisions']);
    expect(notes.every(n => n.aiGenerated && n.uncertain)).toBe(true);
    expect(notes.find(n => n.section === 'actions')!.owner).toBe('Aminata K.');

    // Espace partagé : le logiciel calcule ; l'erreur de calcul dictée est signalée.
    const table = computeTable(st.workspace.table);
    expect(table.totals.Montant).toBe('6001');
    const recap = st.workspace.items.find(i => i.section === 'recap' && i.authorId === 'jeanpierre')!;
    expect(recap).toMatchObject({ uncertain: true, via: 'voice' });
    expect(recap.reasons.join(' ')).toContain('Calcul faux');
    expect(recap.translations.fr).toMatchObject({ status: 'ok' });
    expect(recap.translations.en).toMatchObject({ status: 'ok' });

    // Correction par un autre participant, confirmation des notes de l'expert.
    await aminata.dispatch(id, { type: 'WS_EDIT_ITEM', by: 'aminata', itemId: recap.id, text: 'Total budget 3 x 1500 = 4500' });
    for (const n of notes) await moussa.dispatch(id, { type: 'WS_CONFIRM_ITEM', by: 'moussa', itemId: n.id });
    await settle();
    expect(moussa.get(id)!.workspace.items.filter(i => i.uncertain)).toHaveLength(0);

    // Compte-rendu : proposé, validé par les trois, publié dans la conversation.
    await moussa.dispatch(id, { type: 'REPORT_PROPOSE', by: 'moussa' });
    await aminata.dispatch(id, { type: 'REPORT_APPROVE', userId: 'aminata' });
    await jp.dispatch(id, { type: 'REPORT_APPROVE', userId: 'jeanpierre' });
    await settle();
    const final = moussa.get(id)!;
    expect(final.report!.status).toBe('validated');
    expect(final.publishedReportId).toBe(final.report!.id);
    expect(final.report!.text).toContain('Maître Diallo');
    expect(final.report!.text).toContain('| **Total** |');

    // Visibilité : les trois participants voient le compte-rendu ; Fatou ne voit même pas la conversation.
    const store = new ConversationStore(w.storage);
    for (const u of ['moussa', 'aminata', 'jeanpierre']) {
      const conv = store.listFor(u).find(c => c.id === final.conversationId)!;
      expect(conv.messages.filter(m => m.kind === 'report')).toHaveLength(1);
    }
    expect(store.listFor('fatou')).toHaveLength(0);
    expect(fatou.get(id)).toBeDefined(); // l'état circule sur le bus de démo : limite connue (voir docs)
    expect(engine.answers[0].transcript.length).toBe(0); // le conseiller interrogé avant toute parole consentie n'a reçu aucune transcription

    await moussa.dispatch(id, { type: 'END', by: 'moussa' });
    await settle();
    expect(jp.get(id)!.status).toBe('ended');
  });

  it('vidéo : le même appel passe en vidéo en cours de route, sans perte d\'état', async () => {
    const w = await runScenario('audio', true);
    const st = w.jp.get(w.id)!;
    expect(st.mode).toBe('video');
    expect(st.log.some(l => l.text.includes('passe l\'appel en vidéo'))).toBe(true);
    expect(st.noteTaking.status).toBe('active');
    expect(st.participants.filter(p => p.status === 'joined')).toHaveLength(5); // 3 personnes + 2 experts
  });

  it('vidéo d\'emblée : même scénario', async () => {
    const w = await runScenario('video');
    expect(w.aminata.get(w.id)!.mode).toBe('video');
    expect(computeTable(w.aminata.get(w.id)!.workspace.table).totals.Montant).toBe('6001');
  });

  it('un participant ne peut pas agir au nom d\'un autre, ni injecter un résultat d\'IA', async () => {
    const w = setupWorld();
    const call = w.moussa.startCall({ mode: 'audio' });
    await w.moussa.dispatch(call.id, { type: 'INVITE_PERSON', by: 'moussa', person: w.aminata.me });
    await w.settle();
    await w.aminata.dispatch(call.id, { type: 'RESPOND_INVITE', userId: 'aminata', accept: true });
    await expect(w.aminata.dispatch(call.id, { type: 'CONSENT', userId: 'moussa', accept: false })).rejects.toThrow(/propre nom/);
    await expect(w.aminata.dispatch(call.id, { type: '_REPORT_PUBLISHED', reportId: 'x' } as any)).rejects.toThrow(/réservée/);
    await expect(w.fatou.dispatch(call.id, { type: 'RESPOND_INVITE', userId: 'fatou', accept: true })).rejects.toThrow(/invitation/);
  });

  it('l\'hôte part : l\'appel continue avec un nouvel hôte', async () => {
    const w = setupWorld();
    const call = w.moussa.startCall({ mode: 'audio' });
    await w.moussa.dispatch(call.id, { type: 'INVITE_PERSON', by: 'moussa', person: w.aminata.me });
    await w.settle();
    await w.aminata.dispatch(call.id, { type: 'RESPOND_INVITE', userId: 'aminata', accept: true });
    await w.moussa.dispatch(call.id, { type: 'LEAVE', userId: 'moussa' });
    await w.settle();
    expect(w.aminata.isHost(call.id)).toBe(true);
    await w.aminata.dispatch(call.id, { type: 'INVITE_PERSON', by: 'aminata', person: w.jp.me });
    await w.settle();
    expect(w.jp.incomingInvitations()).toHaveLength(1);
  });

  it('traduction indisponible : repli explicite, l\'appel continue', async () => {
    const w = setupWorld();
    w.translator.failOn.add('en');
    const call = w.moussa.startCall({ mode: 'audio' });
    await w.moussa.dispatch(call.id, { type: 'INVITE_PERSON', by: 'moussa', person: w.aminata.me });
    await w.settle();
    await w.aminata.dispatch(call.id, { type: 'RESPOND_INVITE', userId: 'aminata', accept: true });
    await w.moussa.dispatch(call.id, { type: 'UTTERANCE', userId: 'moussa', text: 'Bonjour' });
    await w.settle();
    expect(w.aminata.get(call.id)!.captions[0].translations.en).toMatchObject({ status: 'failed' });
    expect(w.logs.some(l => l.event === 'translation_failed' && l.data.to === 'en')).toBe(true);
  });
});
