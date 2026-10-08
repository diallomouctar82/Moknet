// Règles métier d'un appel multi-participants (audio ou vidéo).
//
// Fonction pure : (état, intention) → (nouvel état, effets à exécuter).
// L'hôte de l'appel est la seule source de vérité : il applique les intentions
// de tous les participants dans l'ordre de réception, puis diffuse l'état.

import { ExpertType } from '../../types';
import { DEFAULT_LANG, isSupportedLang, LangCode, getLanguage } from './languages';
import {
  Caption, CallMode, MeetingEffect, MeetingIntent, MeetingRuleError, MeetingState, Participant, Person,
  ROLES_REQUIRING_CONSENT, EXPERT_ROLE_LABELS, WorkspaceItem, ExpertMeetingRole,
} from './types';
import { assessItem, emptyWorkspace, normalizeForDedup, validateColumns } from './workspace';
import { buildReportText, checksum } from './report';
import { EXPERT_DIRECTORY } from './directory';

export const MAX_HUMANS = 6;            // au-delà, le maillage pair-à-pair n'est plus fiable
export const CAPTIONS_KEPT = 20;
export const TRANSCRIPT_MAX = 500;
export const NOTES_EVERY = 3;           // extraction automatique toutes les N interventions

export interface CoreCtx { now: () => number; newId: (prefix: string) => string }

export interface ReduceResult { state: MeetingState; effects: MeetingEffect[] }

export const expertParticipantId = (t: ExpertType) => `expert:${t}`;

export const createMeeting = (args: {
  id: string; conversationId: string; title: string; mode: CallMode; host: Person; now: number;
}): MeetingState => ({
  id: args.id,
  conversationId: args.conversationId,
  title: args.title,
  mode: args.mode,
  hostId: args.host.id,
  status: 'active',
  createdAt: args.now,
  participants: [{
    id: args.host.id, kind: 'human', name: args.host.name, status: 'joined',
    listenLang: args.host.lang, speakLang: args.host.lang, joinedAt: args.now, muted: false, camOn: args.mode === 'video',
  }],
  noteTaking: { status: 'off', consents: {} },
  captions: [],
  transcript: [],
  expertMessages: [],
  workspace: emptyWorkspace(),
  log: [{ at: args.now, kind: 'info', text: `${args.host.name} a démarré un appel ${args.mode === 'video' ? 'vidéo' : 'audio'}` }],
  utterancesSinceNotes: 0,
  version: 1,
});

// --- Accès -----------------------------------------------------------------

export const getParticipant = (s: MeetingState, id: string) => s.participants.find(p => p.id === id);
export const joinedHumans = (s: MeetingState) => s.participants.filter(p => p.kind === 'human' && p.status === 'joined');
export const joinedExperts = (s: MeetingState) => s.participants.filter(p => p.kind === 'expert' && p.status === 'joined');

/** Langues d'écoute distinctes des participants présents (une traduction par langue, pas par personne). */
export const listenerLanguages = (s: MeetingState): LangCode[] =>
  Array.from(new Set(joinedHumans(s).map(p => p.listenLang)));

const requireJoinedHuman = (s: MeetingState, id: string): Participant => {
  const p = getParticipant(s, id);
  if (!p || p.kind !== 'human' || p.status !== 'joined') throw new MeetingRuleError('Action réservée aux participants présents dans l\'appel');
  return p;
};

const log = (s: MeetingState, at: number, text: string, kind: 'info' | 'consent' | 'warning' = 'info') => {
  s.log.push({ at, text, kind });
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
};

// --- Consentement à la prise de notes ---------------------------------------

const noteTakers = (s: MeetingState) =>
  joinedExperts(s).filter(e => e.expertRole && ROLES_REQUIRING_CONSENT.includes(e.expertRole));

/** Recalcule le statut de la prise de notes après une arrivée, un départ ou une réponse. */
const recomputeConsent = (s: MeetingState, at: number) => {
  const nt = s.noteTaking;
  if (nt.status === 'off') return;
  const present = joinedHumans(s).map(p => p.id);
  for (const id of Object.keys(nt.consents)) if (!present.includes(id)) delete nt.consents[id];
  for (const id of present) if (!nt.consents[id]) nt.consents[id] = 'pending';
  if (nt.status === 'refused') return;
  const answers = present.map(id => nt.consents[id]);
  const before = nt.status;
  if (answers.some(a => a === 'refused')) {
    nt.status = 'refused';
    log(s, at, 'Prise de notes refusée : aucune transcription n\'est conservée.', 'consent');
  } else if (answers.length && answers.every(a => a === 'accepted')) {
    nt.status = 'active';
    if (before !== 'active') log(s, at, 'Prise de notes active : tous les participants présents ont accepté.', 'consent');
  } else if (before === 'active') {
    nt.status = 'paused';
    log(s, at, 'Prise de notes en pause : un participant n\'a pas encore donné son accord.', 'consent');
  }
};

const announceNotes = (s: MeetingState, requesterName: string) => {
  const takers = noteTakers(s).map(e => `${e.name} (expert IA, ${e.expertRole ? EXPERT_ROLE_LABELS[e.expertRole] : ''})`);
  return `${requesterName} propose une prise de notes${takers.length ? ` par ${takers.join(', ')}` : ''}. ` +
    'La transcription sert uniquement au récapitulatif et au compte-rendu. Rien n\'est conservé tant que chaque participant n\'a pas accepté ; un seul refus l\'annule.';
};

const startNoteRequest = (s: MeetingState, requester: Participant, at: number) => {
  s.noteTaking = { status: 'requested', requestedBy: requester.id, consents: {}, announcement: '' };
  for (const p of joinedHumans(s)) s.noteTaking.consents[p.id] = p.id === requester.id ? 'accepted' : 'pending';
  s.noteTaking.announcement = announceNotes(s, requester.name);
  log(s, at, s.noteTaking.announcement, 'consent');
  recomputeConsent(s, at);
};

// --- Traduction des éléments de l'espace partagé ---------------------------

/** Marque les langues d'écoute manquantes d'un élément et demande leur traduction. */
const queueItemTranslation = (s: MeetingState, item: WorkspaceItem, effects: MeetingEffect[]) => {
  let queued = false;
  for (const l of listenerLanguages(s)) {
    if (l === item.lang) continue;
    const t = item.translations[l];
    if (t && t.status !== 'failed') continue;
    item.translations[l] = { status: 'pending', experimental: getLanguage(l)?.captions === 'experimental' };
    queued = true;
  }
  if (queued) effects.push({ type: 'translate_item', itemId: item.id });
};

// --- Compte-rendu ----------------------------------------------------------

const maybeValidateReport = (s: MeetingState, at: number, effects: MeetingEffect[]) => {
  const r = s.report;
  if (!r || r.status !== 'pending_approval') return;
  const answers = Object.values(r.approvals);
  if (answers.length && answers.every(a => a === 'approved')) {
    r.status = 'validated';
    r.validatedAt = at;
    r.checksum = checksum(r.text);
    log(s, at, `Compte-rendu validé par ${answers.length} participant(s). Visible uniquement par eux.`);
    effects.push({ type: 'publish_report' });
  }
};

// --- Réducteur -------------------------------------------------------------

export const reduceMeeting = (prev: MeetingState, intent: MeetingIntent, ctx: CoreCtx): ReduceResult => {
  const s: MeetingState = structuredClone(prev);
  const at = ctx.now();
  const effects: MeetingEffect[] = [];

  const allowedAfterEnd = ['REPORT_APPROVE', 'REPORT_REQUEST_CHANGES', '_REPORT_PUBLISHED', '_CAPTION_TRANSLATED', '_ITEM_TRANSLATED', '_EXPERT_ANSWER'];
  if (s.status === 'ended' && !allowedAfterEnd.includes(intent.type)) {
    throw new MeetingRuleError('L\'appel est terminé');
  }

  switch (intent.type) {
    case 'INVITE_PERSON': {
      const by = requireJoinedHuman(s, intent.by);
      const existing = getParticipant(s, intent.person.id);
      if (existing?.status === 'joined') throw new MeetingRuleError(`${existing.name} est déjà dans l'appel`);
      if (existing?.status === 'invited') throw new MeetingRuleError(`${existing.name} a déjà une invitation en attente`);
      const activeHumans = s.participants.filter(p => p.kind === 'human' && (p.status === 'joined' || p.status === 'invited')).length;
      if (activeHumans >= MAX_HUMANS) throw new MeetingRuleError(`Limite de ${MAX_HUMANS} personnes atteinte pour un appel`);
      const lang = isSupportedLang(intent.person.lang) ? intent.person.lang : DEFAULT_LANG;
      const p: Participant = {
        id: intent.person.id, kind: 'human', name: intent.person.name, status: 'invited',
        listenLang: lang, speakLang: lang, invitedBy: by.id, invitedAt: at, muted: false, camOn: s.mode === 'video',
      };
      if (existing) Object.assign(existing, p); else s.participants.push(p);
      log(s, at, `${by.name} invite ${p.name}`);
      break;
    }

    case 'INVITE_EXPERT': {
      const by = requireJoinedHuman(s, intent.by);
      const meta = EXPERT_DIRECTORY.find(e => e.type === intent.expertType);
      if (!meta) throw new MeetingRuleError('Expert inconnu');
      if (!EXPERT_ROLE_LABELS[intent.role]) throw new MeetingRuleError('Rôle d\'expert inconnu');
      const id = expertParticipantId(intent.expertType);
      const existing = getParticipant(s, id);
      const p: Participant = {
        id, kind: 'expert', name: meta.name, status: 'joined', expertType: intent.expertType, expertRole: intent.role,
        listenLang: by.listenLang, speakLang: by.speakLang, invitedBy: by.id, invitedAt: at, joinedAt: at,
      };
      if (existing) Object.assign(existing, p); else s.participants.push(p);
      log(s, at, `${meta.name} (expert IA MokNet) rejoint l'appel — rôle : ${EXPERT_ROLE_LABELS[intent.role]}. Invité par ${by.name}.`);
      // Tout nouveau preneur de notes est annoncé et soumis à l'accord de chacun,
      // même si une prise de notes était déjà acceptée.
      if (ROLES_REQUIRING_CONSENT.includes(intent.role)) startNoteRequest(s, by, at);
      break;
    }

    case 'RESPOND_INVITE': {
      const p = getParticipant(s, intent.userId);
      if (!p || p.kind !== 'human' || p.status !== 'invited') throw new MeetingRuleError('Aucune invitation en attente');
      if (intent.accept) {
        p.status = 'joined';
        p.joinedAt = at;
        log(s, at, `${p.name} a rejoint l'appel`);
        s.workspace.items.forEach(it => queueItemTranslation(s, it, effects));
        if (s.noteTaking.status !== 'off') {
          recomputeConsent(s, at);
          if (s.noteTaking.consents[p.id] === 'pending') {
            log(s, at, `${p.name} doit accepter ou refuser la prise de notes en cours.`, 'consent');
          }
        }
        if (s.report?.status === 'pending_approval') {
          s.report.approvals[p.id] = 'pending';
          if (!s.report.authorizedViewers.includes(p.id)) s.report.authorizedViewers.push(p.id);
        }
      } else {
        p.status = 'declined';
        log(s, at, `${p.name} a refusé l'invitation`);
      }
      break;
    }

    case 'LEAVE': {
      const p = requireJoinedHuman(s, intent.userId);
      p.status = 'left';
      p.leftAt = at;
      log(s, at, `${p.name} a quitté l'appel`);
      if (s.report?.status === 'pending_approval' && s.report.approvals[p.id] !== 'approved') {
        delete s.report.approvals[p.id];
        s.report.authorizedViewers = s.report.authorizedViewers.filter(id => id !== p.id);
        log(s, at, `${p.name} n'a pas validé le compte-rendu avant de partir : il ne lui sera pas accessible.`, 'warning');
      }
      const remaining = joinedHumans(s);
      if (!remaining.length) {
        s.status = 'ended';
        s.endedAt = at;
        log(s, at, 'Appel terminé (plus aucun participant)');
        break;
      }
      if (s.hostId === p.id) {
        const next = [...remaining].sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0))[0];
        s.hostId = next.id;
        log(s, at, `${next.name} devient hôte de l'appel`);
      }
      recomputeConsent(s, at);
      maybeValidateReport(s, at, effects);
      break;
    }

    case 'END': {
      const p = requireJoinedHuman(s, intent.by);
      if (p.id !== s.hostId) throw new MeetingRuleError('Seul l\'hôte peut terminer l\'appel pour tous');
      s.status = 'ended';
      s.endedAt = at;
      s.participants.forEach(x => { if (x.status === 'invited') x.status = 'declined'; });
      log(s, at, `${p.name} a terminé l'appel`);
      break;
    }

    case 'SET_MODE': {
      const p = requireJoinedHuman(s, intent.by);
      if (s.mode === intent.mode) break;
      s.mode = intent.mode;
      // Passer en vidéo allume les caméras par défaut (chacun peut ensuite couper la sienne).
      for (const h of s.participants) if (h.kind === 'human') h.camOn = intent.mode === 'video';
      log(s, at, `${p.name} passe l'appel en ${intent.mode === 'video' ? 'vidéo' : 'audio'}`);
      break;
    }

    case 'SET_LANG': {
      const p = getParticipant(s, intent.userId);
      if (!p || p.kind !== 'human' || (p.status !== 'joined' && p.status !== 'invited')) throw new MeetingRuleError('Participant introuvable');
      for (const l of [intent.listenLang, intent.speakLang]) {
        if (l !== undefined && !isSupportedLang(l)) throw new MeetingRuleError(`Langue non prise en charge : ${l}`);
      }
      if (intent.listenLang) p.listenLang = intent.listenLang;
      if (intent.speakLang) p.speakLang = intent.speakLang;
      if (intent.listenLang && p.status === 'joined') s.workspace.items.forEach(it => queueItemTranslation(s, it, effects));
      break;
    }

    case 'SET_MEDIA': {
      const p = requireJoinedHuman(s, intent.userId);
      if (intent.muted !== undefined) p.muted = intent.muted;
      if (intent.camOn !== undefined) p.camOn = intent.camOn;
      break;
    }

    case 'REQUEST_NOTES': {
      const p = requireJoinedHuman(s, intent.by);
      if (s.noteTaking.status === 'active') throw new MeetingRuleError('La prise de notes est déjà active');
      startNoteRequest(s, p, at);
      break;
    }

    case 'CONSENT': {
      const p = requireJoinedHuman(s, intent.userId);
      if (s.noteTaking.status === 'off') throw new MeetingRuleError('Aucune prise de notes n\'est demandée');
      if (!s.noteTaking.consents[p.id]) throw new MeetingRuleError('Aucun accord attendu de ce participant');
      s.noteTaking.consents[p.id] = intent.accept ? 'accepted' : 'refused';
      log(s, at, `${p.name} ${intent.accept ? 'accepte' : 'refuse'} la prise de notes`, 'consent');
      recomputeConsent(s, at);
      break;
    }

    case 'STOP_NOTES': {
      const p = requireJoinedHuman(s, intent.by);
      s.noteTaking = { status: 'off', consents: {} };
      log(s, at, `${p.name} a arrêté la prise de notes`, 'consent');
      break;
    }

    case 'UTTERANCE': {
      const p = requireJoinedHuman(s, intent.userId);
      const text = intent.text.trim();
      if (!text) throw new MeetingRuleError('Intervention vide');
      const lang = intent.lang && isSupportedLang(intent.lang) ? intent.lang : p.speakLang;
      const caption = newCaption(s, ctx, { speakerId: p.id, speakerName: p.name, sourceLang: lang, text, at, kind: 'speech' });
      if (s.noteTaking.status === 'active') {
        s.transcript.push(caption);
        if (s.transcript.length > TRANSCRIPT_MAX) s.transcript.splice(0, s.transcript.length - TRANSCRIPT_MAX);
        s.utterancesSinceNotes += 1;
        if (s.utterancesSinceNotes >= NOTES_EVERY) {
          s.utterancesSinceNotes = 0;
          for (const e of noteTakers(s)) {
            effects.push({ type: e.expertRole === 'NOTE_TAKER' ? 'expert_notes' : 'expert_recap', expertId: e.id });
          }
        }
      }
      if (caption.translations && Object.keys(caption.translations).length) effects.push({ type: 'translate', captionId: caption.id });
      break;
    }

    case 'ASK_EXPERT': {
      const p = requireJoinedHuman(s, intent.by);
      const e = getParticipant(s, intent.expertId);
      if (!e || e.kind !== 'expert' || e.status !== 'joined') throw new MeetingRuleError('Cet expert n\'est pas dans l\'appel');
      if (e.expertRole !== 'ADVISOR') throw new MeetingRuleError(`${e.name} est ${EXPERT_ROLE_LABELS[e.expertRole!]} : il ne répond pas aux questions`);
      const question = intent.question.trim();
      if (!question) throw new MeetingRuleError('Question vide');
      const id = ctx.newId('ask');
      s.expertMessages.push({ id, expertId: e.id, expertName: e.name, askedBy: p.id, question, lang: p.listenLang, status: 'pending', at });
      if (s.expertMessages.length > 100) s.expertMessages.splice(0, s.expertMessages.length - 100);
      effects.push({ type: 'expert_answer', messageId: id });
      break;
    }

    case 'REFRESH_EXPERT': {
      requireJoinedHuman(s, intent.by);
      const e = getParticipant(s, intent.expertId);
      if (!e || e.kind !== 'expert' || e.status !== 'joined') throw new MeetingRuleError('Cet expert n\'est pas dans l\'appel');
      if (!e.expertRole || !ROLES_REQUIRING_CONSENT.includes(e.expertRole)) throw new MeetingRuleError('Cet expert ne prend pas de notes');
      if (s.noteTaking.status !== 'active') throw new MeetingRuleError('La prise de notes doit être acceptée par tous les participants');
      s.utterancesSinceNotes = 0;
      effects.push({ type: e.expertRole === 'NOTE_TAKER' ? 'expert_notes' : 'expert_recap', expertId: e.id });
      break;
    }

    case 'WS_ADD_ITEM': {
      const p = requireJoinedHuman(s, intent.by);
      const text = intent.text.trim();
      if (!text) throw new MeetingRuleError('Texte vide');
      const item = assessItem({
        id: ctx.newId('item'), section: intent.section, text, owner: intent.owner?.trim() || undefined, due: intent.due?.trim() || undefined,
        authorId: p.id, authorName: p.name, aiGenerated: false, confirmedBy: [], uncertain: false, reasons: [], calcChecks: [],
        via: intent.via ?? 'text', lang: p.speakLang, translations: {}, createdAt: at, updatedAt: at, history: [],
      });
      s.workspace.items.push(item);
      queueItemTranslation(s, item, effects);
      break;
    }

    case 'WS_EDIT_ITEM': {
      const p = requireJoinedHuman(s, intent.by);
      const it = s.workspace.items.find(i => i.id === intent.itemId);
      if (!it) throw new MeetingRuleError('Élément introuvable');
      const text = intent.text.trim();
      if (!text) throw new MeetingRuleError('Texte vide');
      it.history.push({ by: p.name, at, text: it.text });
      it.text = text;
      if (intent.owner !== undefined) it.owner = intent.owner.trim() || undefined;
      if (intent.due !== undefined) it.due = intent.due.trim() || undefined;
      it.confirmedBy = [];          // le contenu a changé : les confirmations précédentes ne valent plus
      it.updatedAt = at;
      it.via = intent.via ?? 'text';
      it.lang = p.speakLang;
      it.translations = {};
      Object.assign(it, assessItem(it));
      queueItemTranslation(s, it, effects);
      break;
    }

    case 'WS_CONFIRM_ITEM': {
      const p = requireJoinedHuman(s, intent.by);
      const it = s.workspace.items.find(i => i.id === intent.itemId);
      if (!it) throw new MeetingRuleError('Élément introuvable');
      if (!it.confirmedBy.includes(p.id)) it.confirmedBy.push(p.id);
      Object.assign(it, assessItem(it));
      break;
    }

    case 'WS_DELETE_ITEM': {
      requireJoinedHuman(s, intent.by);
      const before = s.workspace.items.length;
      s.workspace.items = s.workspace.items.filter(i => i.id !== intent.itemId);
      if (s.workspace.items.length === before) throw new MeetingRuleError('Élément introuvable');
      break;
    }

    case 'WS_TABLE_SETUP': {
      requireJoinedHuman(s, intent.by);
      const err = validateColumns(intent.columns);
      if (err) throw new MeetingRuleError(err);
      s.workspace.table = {
        title: intent.title.trim() || 'Tableau',
        columns: intent.columns.map(c => ({ ...c, name: c.name.trim(), id: ctx.newId('col') })),
        rows: s.workspace.table.rows,
      };
      break;
    }

    case 'WS_TABLE_ADD_ROW': {
      const p = requireJoinedHuman(s, intent.by);
      if (!s.workspace.table.columns.length) throw new MeetingRuleError('Définissez d\'abord les colonnes du tableau');
      const cells: Record<string, string> = {};
      for (const c of s.workspace.table.columns) {
        if (c.type === 'computed') continue; // calculé par le logiciel
        cells[c.name] = (intent.cells[c.name] ?? '').trim();
      }
      s.workspace.table.rows.push({ id: ctx.newId('row'), cells, authorId: p.id, updatedAt: at });
      break;
    }

    case 'WS_TABLE_EDIT_CELL': {
      requireJoinedHuman(s, intent.by);
      const row = s.workspace.table.rows.find(r => r.id === intent.rowId);
      const col = s.workspace.table.columns.find(c => c.name === intent.column);
      if (!row || !col) throw new MeetingRuleError('Cellule introuvable');
      if (col.type === 'computed') throw new MeetingRuleError(`« ${col.name} » est calculée par le logiciel et ne se modifie pas à la main`);
      row.cells[col.name] = intent.value.trim();
      row.updatedAt = at;
      break;
    }

    case 'WS_TABLE_DELETE_ROW': {
      requireJoinedHuman(s, intent.by);
      s.workspace.table.rows = s.workspace.table.rows.filter(r => r.id !== intent.rowId);
      break;
    }

    case 'REPORT_PROPOSE': {
      const p = requireJoinedHuman(s, intent.by);
      if (s.report?.status === 'validated') throw new MeetingRuleError('Le compte-rendu est déjà validé');
      const humans = joinedHumans(s);
      const text = buildReportText(s, p.listenLang, at);
      s.report = {
        id: ctx.newId('report'), status: 'pending_approval', text, proposedBy: p.id, proposedAt: at,
        approvals: Object.fromEntries(humans.map(h => [h.id, h.id === p.id ? 'approved' : 'pending'])),
        comments: s.report?.comments ?? [],
        authorizedViewers: humans.map(h => h.id),
      };
      log(s, at, `${p.name} soumet le compte-rendu à la validation de ${humans.length} participant(s)`);
      maybeValidateReport(s, at, effects);
      break;
    }

    case 'REPORT_APPROVE': {
      const r = s.report;
      if (!r || r.status !== 'pending_approval') throw new MeetingRuleError('Aucun compte-rendu en attente de validation');
      if (!(intent.userId in r.approvals)) throw new MeetingRuleError('Vous ne faites pas partie des validateurs');
      r.approvals[intent.userId] = 'approved';
      const name = getParticipant(s, intent.userId)?.name ?? intent.userId;
      log(s, at, `${name} valide le compte-rendu`);
      maybeValidateReport(s, at, effects);
      break;
    }

    case 'REPORT_REQUEST_CHANGES': {
      const r = s.report;
      if (!r || r.status !== 'pending_approval') throw new MeetingRuleError('Aucun compte-rendu en attente de validation');
      if (!(intent.userId in r.approvals)) throw new MeetingRuleError('Vous ne faites pas partie des validateurs');
      r.approvals[intent.userId] = 'changes_requested';
      r.status = 'changes_requested';
      const name = getParticipant(s, intent.userId)?.name ?? intent.userId;
      r.comments.push({ by: name, at, text: intent.comment.trim() || '(sans commentaire)' });
      log(s, at, `${name} demande une correction du compte-rendu : ${intent.comment.trim()}`, 'warning');
      break;
    }

    case '_CAPTION_TRANSLATED': {
      for (const list of [s.captions, s.transcript]) {
        const c = list.find(x => x.id === intent.captionId);
        if (c) c.translations = { ...c.translations, ...intent.translations };
      }
      break;
    }

    case '_ITEM_TRANSLATED': {
      const it = s.workspace.items.find(i => i.id === intent.itemId);
      // Une traduction d'un texte modifié entre-temps est périmée : on l'ignore.
      if (it && it.text === intent.sourceText) it.translations = { ...it.translations, ...intent.translations };
      break;
    }

    case '_EXPERT_ANSWER': {
      const m = s.expertMessages.find(x => x.id === intent.messageId);
      if (!m) break;
      if (intent.failed || !intent.answer) {
        m.status = 'failed';
        break;
      }
      m.status = 'answered';
      m.answer = intent.answer;
      if (s.status === 'active') {
        const c = newCaption(s, ctx, { speakerId: m.expertId, speakerName: m.expertName, sourceLang: m.lang, text: intent.answer, at, kind: 'expert' });
        if (Object.keys(c.translations).length) effects.push({ type: 'translate', captionId: c.id });
      }
      break;
    }

    case '_EXPERT_NOTES': {
      // Le consentement a pu être retiré pendant le traitement : on n'écrit rien dans ce cas.
      if (s.noteTaking.status !== 'active') { log(s, at, 'Notes de l\'expert ignorées : consentement non actif', 'warning'); break; }
      const e = getParticipant(s, intent.expertId);
      if (!e || e.status !== 'joined') break;
      const seen = new Set(s.workspace.items.map(i => `${i.section}|${normalizeForDedup(i.text)}`));
      for (const n of intent.items) {
        const key = `${n.section}|${normalizeForDedup(n.text)}`;
        if (!n.text.trim() || seen.has(key)) continue;
        seen.add(key);
        const item = assessItem({
          id: ctx.newId('item'), section: n.section, text: n.text.trim(), owner: n.owner, due: n.due,
          authorId: e.id, authorName: e.name, aiGenerated: true, confirmedBy: [], uncertain: true, reasons: [], calcChecks: [],
          via: 'expert', lang: e.listenLang, translations: {}, createdAt: at, updatedAt: at, history: [],
        });
        s.workspace.items.push(item);
        queueItemTranslation(s, item, effects);
      }
      break;
    }

    case '_EXPERT_RECAP': {
      if (s.noteTaking.status !== 'active') { log(s, at, 'Récap de l\'expert ignoré : consentement non actif', 'warning'); break; }
      const e = getParticipant(s, intent.expertId);
      if (!e || e.status !== 'joined' || !intent.text.trim()) break;
      const existing = s.workspace.items.find(i => i.section === 'recap' && i.authorId === e.id);
      if (existing) {
        existing.history.push({ by: e.name, at, text: existing.text });
        existing.text = intent.text.trim();
        existing.confirmedBy = [];
        existing.updatedAt = at;
        existing.lang = e.listenLang;
        existing.translations = {};
        Object.assign(existing, assessItem(existing));
        queueItemTranslation(s, existing, effects);
      } else {
        const item = assessItem({
          id: ctx.newId('item'), section: 'recap', text: intent.text.trim(), authorId: e.id, authorName: e.name,
          aiGenerated: true, confirmedBy: [], uncertain: true, reasons: [], calcChecks: [], via: 'expert',
          lang: e.listenLang, translations: {}, createdAt: at, updatedAt: at, history: [],
        });
        s.workspace.items.push(item);
        queueItemTranslation(s, item, effects);
      }
      break;
    }

    case '_REPORT_PUBLISHED': {
      s.publishedReportId = intent.reportId;
      log(s, at, 'Compte-rendu enregistré dans la conversation');
      break;
    }

    default: {
      const never: never = intent;
      throw new MeetingRuleError(`Intention inconnue : ${(never as any).type}`);
    }
  }

  s.version = prev.version + 1;
  return { state: s, effects };
};

function newCaption(
  s: MeetingState, ctx: CoreCtx,
  c: Omit<Caption, 'id' | 'translations'>,
): Caption {
  const translations: Caption['translations'] = {};
  for (const l of listenerLanguages(s)) {
    if (l !== c.sourceLang) translations[l] = { status: 'pending', experimental: getLanguage(l)?.captions === 'experimental' };
  }
  const caption: Caption = { ...c, id: ctx.newId('cap'), translations };
  s.captions.push(caption);
  if (s.captions.length > CAPTIONS_KEPT) s.captions.splice(0, s.captions.length - CAPTIONS_KEPT);
  return caption;
}

export type { WorkspaceItem, ExpertMeetingRole };
