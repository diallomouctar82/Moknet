import { describe, it, expect } from 'vitest';
import { createMeeting, reduceMeeting, MAX_HUMANS, expertParticipantId } from '../../services/meeting/meetingCore';
import { MeetingIntent, MeetingState, MeetingRuleError } from '../../services/meeting/types';
import { ExpertType } from '../../types';
import { testCtx } from './helpers';

const moussa = { id: 'moussa', name: 'Moussa D.', lang: 'fr' as const };
const aminata = { id: 'aminata', name: 'Aminata K.', lang: 'en' as const };
const jp = { id: 'jeanpierre', name: 'Jean-Pierre M.', lang: 'es' as const };
const MAITRE = expertParticipantId(ExpertType.MAITRE);

const setup = () => {
  const ctx = testCtx();
  let state: MeetingState = createMeeting({ id: 'm1', conversationId: 'c1', title: 'Chantier', mode: 'audio', host: moussa, now: ctx.now() });
  const effects: any[] = [];
  const run = (i: MeetingIntent) => { const r = reduceMeeting(state, i, ctx); state = r.state; effects.push(...r.effects); ctx.tick(); return r; };
  return { ctx, run, get state() { return state; }, effects };
};

const p = (s: MeetingState, id: string) => s.participants.find(x => x.id === id)!;

describe('invitations en cours d\'appel', () => {
  it('ajoute un participant sans raccrocher ; il accepte ou refuse', () => {
    const t = setup();
    t.run({ type: 'INVITE_PERSON', by: 'moussa', person: aminata });
    expect(p(t.state, 'aminata').status).toBe('invited');
    t.run({ type: 'RESPOND_INVITE', userId: 'aminata', accept: true });
    expect(p(t.state, 'aminata').status).toBe('joined');
    expect(t.state.status).toBe('active');
    t.run({ type: 'INVITE_PERSON', by: 'aminata', person: jp });
    t.run({ type: 'RESPOND_INVITE', userId: 'jeanpierre', accept: false });
    expect(p(t.state, 'jeanpierre').status).toBe('declined');
    // Une personne qui a refusé peut être réinvitée.
    t.run({ type: 'INVITE_PERSON', by: 'moussa', person: jp });
    expect(p(t.state, 'jeanpierre').status).toBe('invited');
  });

  it('refuse les doublons, les non-participants et le dépassement de capacité', () => {
    const t = setup();
    t.run({ type: 'INVITE_PERSON', by: 'moussa', person: aminata });
    expect(() => t.run({ type: 'INVITE_PERSON', by: 'moussa', person: aminata })).toThrow(MeetingRuleError);
    expect(() => t.run({ type: 'INVITE_PERSON', by: 'aminata', person: jp })).toThrow(/participants présents/);
    for (let i = 0; i < MAX_HUMANS - 2; i++) t.run({ type: 'INVITE_PERSON', by: 'moussa', person: { id: `u${i}`, name: `U${i}`, lang: 'fr' } });
    expect(() => t.run({ type: 'INVITE_PERSON', by: 'moussa', person: { id: 'extra', name: 'X', lang: 'fr' } })).toThrow(/Limite/);
  });

  it('transfère l\'hôte quand il part, termine quand tout le monde est parti', () => {
    const t = setup();
    t.run({ type: 'INVITE_PERSON', by: 'moussa', person: aminata });
    t.run({ type: 'RESPOND_INVITE', userId: 'aminata', accept: true });
    expect(() => t.run({ type: 'END', by: 'aminata' })).toThrow(/hôte/);
    t.run({ type: 'LEAVE', userId: 'moussa' });
    expect(t.state.hostId).toBe('aminata');
    t.run({ type: 'LEAVE', userId: 'aminata' });
    expect(t.state.status).toBe('ended');
    expect(() => t.run({ type: 'INVITE_PERSON', by: 'aminata', person: jp })).toThrow(/terminé/);
  });

  it('passe de l\'audio à la vidéo en cours d\'appel', () => {
    const t = setup();
    expect(p(t.state, 'moussa').camOn).toBe(false);
    t.run({ type: 'SET_MODE', by: 'moussa', mode: 'video' });
    expect(t.state.mode).toBe('video');
    expect(p(t.state, 'moussa').camOn).toBe(true);
  });
});

describe('experts MokNet et compétences de collaboration', () => {
  it('un conseiller rejoint sans prise de notes et ne répond que s\'il est sollicité', () => {
    const t = setup();
    const r = t.run({ type: 'INVITE_EXPERT', by: 'moussa', expertType: ExpertType.MAITRE, role: 'ADVISOR' });
    expect(p(t.state, MAITRE)).toMatchObject({ kind: 'expert', status: 'joined', expertRole: 'ADVISOR' });
    expect(t.state.noteTaking.status).toBe('off');
    expect(r.effects).toEqual([]);
    t.run({ type: 'UTTERANCE', userId: 'moussa', text: 'Bonjour' });
    expect(t.effects.some(e => e.type === 'expert_answer')).toBe(false);
    const ask = t.run({ type: 'ASK_EXPERT', by: 'moussa', expertId: MAITRE, question: 'Faut-il un permis ?' });
    expect(ask.effects).toEqual([{ type: 'expert_answer', messageId: expect.any(String) }]);
    expect(t.state.log.some(l => l.text.includes('expert IA MokNet'))).toBe(true);
  });

  it('un preneur de notes déclenche l\'annonce et la demande d\'accord', () => {
    const t = setup();
    t.run({ type: 'INVITE_PERSON', by: 'moussa', person: aminata });
    t.run({ type: 'RESPOND_INVITE', userId: 'aminata', accept: true });
    t.run({ type: 'INVITE_EXPERT', by: 'moussa', expertType: ExpertType.MAITRE, role: 'NOTE_TAKER' });
    expect(t.state.noteTaking.status).toBe('requested');
    expect(t.state.noteTaking.announcement).toContain('Maître Diallo (expert IA');
    expect(t.state.noteTaking.consents).toEqual({ moussa: 'accepted', aminata: 'pending' });
    expect(() => t.run({ type: 'ASK_EXPERT', by: 'moussa', expertId: MAITRE, question: 'x' })).toThrow(/ne répond pas/);
  });
});

describe('prise de notes : annoncée et acceptée par tous', () => {
  const withNotes = () => {
    const t = setup();
    t.run({ type: 'INVITE_PERSON', by: 'moussa', person: aminata });
    t.run({ type: 'RESPOND_INVITE', userId: 'aminata', accept: true });
    t.run({ type: 'INVITE_EXPERT', by: 'moussa', expertType: ExpertType.MAITRE, role: 'NOTE_TAKER' });
    return t;
  };

  it('rien n\'est conservé tant que tout le monde n\'a pas accepté', () => {
    const t = withNotes();
    t.run({ type: 'UTTERANCE', userId: 'moussa', text: 'Le budget est confidentiel' });
    expect(t.state.transcript).toHaveLength(0);
    t.run({ type: 'CONSENT', userId: 'aminata', accept: true });
    expect(t.state.noteTaking.status).toBe('active');
    t.run({ type: 'UTTERANCE', userId: 'aminata', text: 'We decided to start Monday' });
    expect(t.state.transcript).toHaveLength(1);
  });

  it('un nouvel arrivant met la prise de notes en pause jusqu\'à son accord', () => {
    const t = withNotes();
    t.run({ type: 'CONSENT', userId: 'aminata', accept: true });
    t.run({ type: 'INVITE_PERSON', by: 'moussa', person: jp });
    t.run({ type: 'RESPOND_INVITE', userId: 'jeanpierre', accept: true });
    expect(t.state.noteTaking.status).toBe('paused');
    t.run({ type: 'UTTERANCE', userId: 'jeanpierre', text: 'Hola' });
    expect(t.state.transcript).toHaveLength(0);
    t.run({ type: 'CONSENT', userId: 'jeanpierre', accept: true });
    expect(t.state.noteTaking.status).toBe('active');
  });

  it('un seul refus annule ; le départ du dernier indécis réactive', () => {
    const t = withNotes();
    t.run({ type: 'CONSENT', userId: 'aminata', accept: false });
    expect(t.state.noteTaking.status).toBe('refused');
    t.run({ type: 'UTTERANCE', userId: 'moussa', text: 'test' });
    expect(t.state.transcript).toHaveLength(0);

    const u = withNotes();
    u.run({ type: 'CONSENT', userId: 'aminata', accept: true });
    u.run({ type: 'INVITE_PERSON', by: 'moussa', person: jp });
    u.run({ type: 'RESPOND_INVITE', userId: 'jeanpierre', accept: true });
    expect(u.state.noteTaking.status).toBe('paused');
    u.run({ type: 'LEAVE', userId: 'jeanpierre' });
    expect(u.state.noteTaking.status).toBe('active');
  });

  it('les notes produites par l\'IA après un retrait de consentement sont ignorées', () => {
    const t = withNotes();
    t.run({ type: 'CONSENT', userId: 'aminata', accept: true });
    t.run({ type: 'STOP_NOTES', by: 'aminata' });
    t.run({ type: '_EXPERT_NOTES', expertId: MAITRE, round: t.state.noteTaking.round, items: [{ section: 'decisions', text: 'secret' }] });
    expect(t.state.workspace.items).toHaveLength(0);
  });

  it('retirer ou refuser l\'accord efface la transcription brute', () => {
    const t = withNotes();
    t.run({ type: 'CONSENT', userId: 'aminata', accept: true });
    t.run({ type: 'UTTERANCE', userId: 'aminata', text: 'My salary is 1200 and I am ill' });
    expect(t.state.transcript).toHaveLength(1);
    t.run({ type: 'STOP_NOTES', by: 'aminata' });
    expect(t.state.transcript).toHaveLength(0);

    const u = withNotes();
    u.run({ type: 'CONSENT', userId: 'aminata', accept: true });
    u.run({ type: 'UTTERANCE', userId: 'aminata', text: 'confidentiel' });
    u.run({ type: 'INVITE_PERSON', by: 'moussa', person: jp });
    u.run({ type: 'RESPOND_INVITE', userId: 'jeanpierre', accept: true });
    u.run({ type: 'CONSENT', userId: 'jeanpierre', accept: false });
    expect(u.state.noteTaking.status).toBe('refused');
    expect(u.state.transcript).toHaveLength(0);
  });

  it('un résultat d\'IA d\'un tour de consentement précédent est ignoré', () => {
    const t = withNotes();
    t.run({ type: 'CONSENT', userId: 'aminata', accept: true });
    const oldRound = t.state.noteTaking.round;
    t.run({ type: 'STOP_NOTES', by: 'aminata' });
    t.run({ type: 'REQUEST_NOTES', by: 'moussa' });
    t.run({ type: 'CONSENT', userId: 'aminata', accept: true });
    expect(t.state.noteTaking.status).toBe('active');
    expect(t.state.noteTaking.round).toBe(oldRound + 1);
    t.run({ type: '_EXPERT_NOTES', expertId: MAITRE, round: oldRound, items: [{ section: 'decisions', text: 'dit avant le retrait' }] });
    t.run({ type: '_EXPERT_RECAP', expertId: MAITRE, round: oldRound, text: 'récap ancien' });
    expect(t.state.workspace.items).toHaveLength(0);
  });

  it('les notes de l\'expert arrivent marquées incertaines, dédoublonnées, puis confirmables', () => {
    const t = withNotes();
    t.run({ type: 'CONSENT', userId: 'aminata', accept: true });
    t.run({ type: '_EXPERT_NOTES', expertId: MAITRE, round: t.state.noteTaking.round, items: [{ section: 'decisions', text: 'Démarrage lundi' }, { section: 'decisions', text: 'démarrage  LUNDI' }] });
    expect(t.state.workspace.items).toHaveLength(1);
    const it0 = t.state.workspace.items[0];
    expect(it0).toMatchObject({ aiGenerated: true, uncertain: true });
    t.run({ type: 'WS_CONFIRM_ITEM', by: 'aminata', itemId: it0.id });
    expect(t.state.workspace.items[0].uncertain).toBe(false);
  });
});

describe('espace partagé', () => {
  it('un participant corrige ; l\'historique est gardé et les confirmations repartent de zéro', () => {
    const t = setup();
    t.run({ type: 'WS_ADD_ITEM', by: 'moussa', section: 'decisions', text: 'Commande de 3 x 1500 = 4000 GNF' });
    const item = t.state.workspace.items[0];
    expect(item.uncertain).toBe(true);
    expect(item.reasons.join(' ')).toContain('Calcul faux');
    t.run({ type: 'WS_CONFIRM_ITEM', by: 'moussa', itemId: item.id });
    expect(t.state.workspace.items[0].uncertain).toBe(true); // confirmer ne corrige pas un calcul faux
    t.run({ type: 'WS_EDIT_ITEM', by: 'moussa', itemId: item.id, text: 'Commande de 3 x 1500 = 4500 GNF', via: 'voice' });
    const edited = t.state.workspace.items[0];
    expect(edited).toMatchObject({ uncertain: false, via: 'voice', confirmedBy: [] });
    expect(edited.history[0].text).toContain('4000');
  });

  it('les colonnes calculées ne se modifient pas à la main', () => {
    const t = setup();
    t.run({ type: 'WS_TABLE_SETUP', by: 'moussa', title: 'Devis', columns: [
      { name: 'Article', type: 'text' }, { name: 'Quantité', type: 'number' }, { name: 'Prix', type: 'number' },
      { name: 'Montant', type: 'computed', formula: '{Quantité} * {Prix}' },
    ] });
    t.run({ type: 'WS_TABLE_ADD_ROW', by: 'moussa', cells: { Article: 'Ciment', Quantité: '3', Prix: '1500', Montant: '999' } });
    expect(t.state.workspace.table.rows[0].cells.Montant).toBeUndefined();
    expect(() => t.run({ type: 'WS_TABLE_EDIT_CELL', by: 'moussa', rowId: t.state.workspace.table.rows[0].id, column: 'Montant', value: '1' })).toThrow(/calculée/);
  });
});

describe('protections issues de la revue', () => {
  const notesOn = () => {
    const t = setup();
    t.run({ type: 'INVITE_PERSON', by: 'moussa', person: aminata });
    t.run({ type: 'RESPOND_INVITE', userId: 'aminata', accept: true });
    t.run({ type: 'INVITE_EXPERT', by: 'moussa', expertType: ExpertType.MAITRE, role: 'NOTE_TAKER' });
    t.run({ type: 'CONSENT', userId: 'aminata', accept: true });
    return t;
  };

  it('une note IA supprimée ou corrigée n\'est pas reproposée', () => {
    const t = notesOn();
    const round = t.state.noteTaking.round;
    t.run({ type: '_EXPERT_NOTES', expertId: MAITRE, round, items: [{ section: 'decisions', text: 'Acheter 3 camions' }, { section: 'decisions', text: 'Ouvrir lundi' }] });
    const [a, b] = t.state.workspace.items;
    t.run({ type: 'WS_DELETE_ITEM', by: 'moussa', itemId: a.id });
    t.run({ type: 'WS_EDIT_ITEM', by: 'aminata', itemId: b.id, text: 'Ouvrir mardi' });
    t.run({ type: '_EXPERT_NOTES', expertId: MAITRE, round, items: [{ section: 'decisions', text: 'Acheter 3 camions' }, { section: 'decisions', text: 'Ouvrir lundi' }] });
    expect(t.state.workspace.items.map(i => i.text)).toEqual(['Ouvrir mardi']);
  });

  it('un récap corrigé par un participant n\'est plus écrasé par l\'expert', () => {
    const t = setup();
    t.run({ type: 'INVITE_EXPERT', by: 'moussa', expertType: ExpertType.DIALLO, role: 'LIVE_RECAP' });
    const id = expertParticipantId(ExpertType.DIALLO);
    const round = t.state.noteTaking.round;
    expect(t.state.noteTaking.status).toBe('active'); // seul présent, le demandeur a accepté
    t.run({ type: '_EXPERT_RECAP', expertId: id, round, text: 'Récap v1' });
    const item = t.state.workspace.items[0];
    t.run({ type: 'WS_EDIT_ITEM', by: 'moussa', itemId: item.id, text: 'Récap corrigé à la main' });
    t.run({ type: '_EXPERT_RECAP', expertId: id, round, text: 'Récap v2' });
    expect(t.state.workspace.items[0].text).toBe('Récap corrigé à la main');
  });

  it('l\'hôte ne peut pas terminer pendant que le compte-rendu attend des validations', () => {
    const t = setup();
    t.run({ type: 'INVITE_PERSON', by: 'moussa', person: aminata });
    t.run({ type: 'RESPOND_INVITE', userId: 'aminata', accept: true });
    t.run({ type: 'REPORT_PROPOSE', by: 'moussa' });
    expect(() => t.run({ type: 'END', by: 'moussa' })).toThrow(/Aminata K\./);
    t.run({ type: 'REPORT_APPROVE', userId: 'aminata' });
    t.run({ type: 'END', by: 'moussa' });
    expect(t.state.status).toBe('ended');
  });

  it('textes, questions et cellules sont bornés', () => {
    const t = setup();
    const long = '1+'.repeat(1500) + '1';
    expect(() => t.run({ type: 'WS_ADD_ITEM', by: 'moussa', section: 'recap', text: long })).toThrow(/trop long/);
    expect(() => t.run({ type: 'UTTERANCE', userId: 'moussa', text: long })).toThrow(/trop longue/);
    t.run({ type: 'WS_TABLE_SETUP', by: 'moussa', title: 'T', columns: [{ name: 'A', type: 'text' }] });
    expect(() => t.run({ type: 'WS_TABLE_ADD_ROW', by: 'moussa', cells: { A: 'x'.repeat(201) } })).toThrow(/trop longue/);
  });

  it('une formule ne peut utiliser que des colonnes placées avant elle', () => {
    const t = setup();
    expect(() => t.run({ type: 'WS_TABLE_SETUP', by: 'moussa', title: 'T', columns: [
      { name: 'Double', type: 'computed', formula: '{Total} * 2' }, { name: 'Total', type: 'number' },
    ] })).toThrow(/placées avant/);
  });

  it('quand l\'hôte change, les traitements en attente ne restent pas « en cours » indéfiniment', () => {
    const t = setup();
    t.run({ type: 'INVITE_PERSON', by: 'moussa', person: aminata });
    t.run({ type: 'RESPOND_INVITE', userId: 'aminata', accept: true });
    t.run({ type: 'INVITE_EXPERT', by: 'moussa', expertType: ExpertType.MAITRE, role: 'ADVISOR' });
    t.run({ type: 'ASK_EXPERT', by: 'aminata', expertId: MAITRE, question: 'Q ?' });
    t.run({ type: 'UTTERANCE', userId: 'moussa', text: 'Bonjour' });
    t.run({ type: 'LEAVE', userId: 'moussa' });
    expect(t.state.expertMessages[0].status).toBe('failed');
    expect(t.state.captions[0].translations.en?.status).toBe('failed');
  });
});

describe('compte-rendu', () => {
  it('validé par tous les présents, visible par eux seuls, puis figé', () => {
    const t = setup();
    t.run({ type: 'INVITE_PERSON', by: 'moussa', person: aminata });
    t.run({ type: 'RESPOND_INVITE', userId: 'aminata', accept: true });
    t.run({ type: 'WS_ADD_ITEM', by: 'moussa', section: 'decisions', text: 'Démarrage lundi' });
    t.run({ type: 'REPORT_PROPOSE', by: 'moussa' });
    expect(t.state.report).toMatchObject({ status: 'pending_approval', approvals: { moussa: 'approved', aminata: 'pending' } });
    t.run({ type: 'REPORT_REQUEST_CHANGES', userId: 'aminata', comment: 'Ajouter le lieu' });
    expect(t.state.report!.status).toBe('changes_requested');
    t.run({ type: 'WS_EDIT_ITEM', by: 'aminata', itemId: t.state.workspace.items[0].id, text: 'Démarrage lundi à Kaloum' });
    t.run({ type: 'REPORT_PROPOSE', by: 'aminata' });
    const r = t.run({ type: 'REPORT_APPROVE', userId: 'moussa' });
    expect(t.state.report!.status).toBe('validated');
    expect(t.state.report!.authorizedViewers.sort()).toEqual(['aminata', 'moussa']);
    expect(t.state.report!.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(t.state.report!.text).toContain('Démarrage lundi à Kaloum');
    expect(r.effects).toContainEqual({ type: 'publish_report' });
    expect(() => t.run({ type: 'REPORT_PROPOSE', by: 'moussa' })).toThrow(/déjà validé/);
  });

  it('un participant qui part sans valider n\'y aura pas accès', () => {
    const t = setup();
    t.run({ type: 'INVITE_PERSON', by: 'moussa', person: aminata });
    t.run({ type: 'RESPOND_INVITE', userId: 'aminata', accept: true });
    t.run({ type: 'INVITE_PERSON', by: 'moussa', person: jp });
    t.run({ type: 'RESPOND_INVITE', userId: 'jeanpierre', accept: true });
    t.run({ type: 'REPORT_PROPOSE', by: 'moussa' });
    t.run({ type: 'REPORT_APPROVE', userId: 'aminata' });
    t.run({ type: 'LEAVE', userId: 'jeanpierre' });
    expect(t.state.report!.status).toBe('validated');
    expect(t.state.report!.authorizedViewers).not.toContain('jeanpierre');
  });

  it('les titres suivent la langue de la personne qui propose', () => {
    const t = setup();
    t.run({ type: 'INVITE_PERSON', by: 'moussa', person: aminata });
    t.run({ type: 'RESPOND_INVITE', userId: 'aminata', accept: true });
    t.run({ type: 'REPORT_PROPOSE', by: 'aminata' });
    expect(t.state.report!.text).toContain('# Meeting report');
    expect(t.state.report!.text).toContain('## Action plan');
  });
});

describe('langues et sous-titres', () => {
  it('une traduction par langue d\'écoute distincte, jamais vers la langue source', () => {
    const t = setup();
    for (const [person, lang] of [[aminata, 'en'], [jp, 'es'], [{ id: 'kofi', name: 'Kofi', lang: 'en' as const }, 'en']] as const) {
      t.run({ type: 'INVITE_PERSON', by: 'moussa', person: { ...person, lang } as any });
      t.run({ type: 'RESPOND_INVITE', userId: person.id, accept: true });
    }
    const r = t.run({ type: 'UTTERANCE', userId: 'moussa', text: 'Bonjour à tous' });
    const cap = t.state.captions.at(-1)!;
    expect(Object.keys(cap.translations).sort()).toEqual(['en', 'es']);
    expect(r.effects).toContainEqual({ type: 'translate', captionId: cap.id });
  });

  it('refuse une langue non prise en charge', () => {
    const t = setup();
    expect(() => t.run({ type: 'SET_LANG', userId: 'moussa', listenLang: 'de' as any })).toThrow(/non prise en charge/);
    t.run({ type: 'SET_LANG', userId: 'moussa', listenLang: 'wo' });
    expect(p(t.state, 'moussa').listenLang).toBe('wo');
  });
});
