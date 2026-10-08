// Client d'appel d'un participant (un par onglet / appareil).
//
// L'hôte de chaque appel applique les intentions de tous (meetingCore), exécute
// les effets (traductions, experts, publication du compte-rendu) puis diffuse
// l'état. Les autres participants envoient leurs intentions et affichent l'état
// reçu. Si l'hôte quitte l'appel, l'hôte suivant reprend à partir du dernier état.

import { Bus, BusMessage } from './bus';
import { reduceMeeting, createMeeting, CoreCtx, getParticipant, joinedHumans } from './meetingCore';
import { CallMode, MeetingEffect, MeetingIntent, MeetingRuleError, MeetingState, Person } from './types';
import { TranslationRouter, Translator } from './translationRouter';
import { ExpertContext, ExpertEngine } from './expertEngine';
import { ConversationStore } from './conversationStore';
import { LangCode } from './languages';

export interface ClientDeps {
  bus: Bus;
  me: Person;
  translator: Translator;
  expertEngine: ExpertEngine;
  store: ConversationStore;
  now?: () => number;
  newId?: (prefix: string) => string;
  ackTimeoutMs?: number;
  translationTimeoutMs?: number;
  onLog?: (event: string, data: Record<string, unknown>) => void;
}

const defaultId = (prefix: string) => {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rnd}`;
};

/** Auteur déclaré d'une intention : il doit être l'émetteur du message. */
const actorOf = (i: MeetingIntent): string | undefined => (i as any).by ?? (i as any).userId;

export class MeetingClient {
  readonly me: Person;
  private meetings = new Map<string, MeetingState>();
  private listeners = new Set<() => void>();
  private signalHandlers = new Set<(m: Extract<BusMessage, { t: 'signal' }>) => void>();
  // Signaux WebRTC reçus avant que le module média ne soit prêt (il se monte après l'affichage) :
  // gardés quelques secondes puis remis dans l'ordre, sinon une offre perdue bloque la connexion.
  private signalQueue: Array<{ at: number; m: Extract<BusMessage, { t: 'signal' }> }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pending = new Map<string, { resolve: (s: MeetingState) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; meetingId: string }>();
  private inflight = new Set<Promise<unknown>>();
  private unsubscribe: () => void;
  private router: TranslationRouter;
  private ctx: CoreCtx;
  public lastError: string | null = null;

  constructor(private deps: ClientDeps) {
    this.me = deps.me;
    this.ctx = { now: deps.now ?? (() => Date.now()), newId: deps.newId ?? defaultId };
    this.router = new TranslationRouter(deps.translator, {
      timeoutMs: deps.translationTimeoutMs,
      onError: (e, info) => this.trace('translation_failed', { ...info, error: String((e as Error)?.message ?? e) }),
    });
    this.unsubscribe = deps.bus.subscribe(m => this.onMessage(m));
    deps.bus.post({ t: 'hello', from: this.me.id });
  }

  // --- Lecture -------------------------------------------------------------

  get(id: string) { return this.meetings.get(id); }
  list() { return Array.from(this.meetings.values()); }
  isHost(id: string) { return this.meetings.get(id)?.hostId === this.me.id; }
  translationStats() { return { ...this.router.stats }; }

  /** Appel en cours auquel je participe. */
  currentMeeting(): MeetingState | undefined {
    return this.list().find(m => m.status === 'active' && getParticipant(m, this.me.id)?.status === 'joined');
  }

  /** Invitations reçues, à accepter ou refuser. */
  incomingInvitations(): MeetingState[] {
    return this.list().filter(m => m.status === 'active' && getParticipant(m, this.me.id)?.status === 'invited');
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  onSignal(fn: (m: Extract<BusMessage, { t: 'signal' }>) => void) {
    this.signalHandlers.add(fn);
    // Remise différée : si l'abonné est remplacé dans la foulée (montage React), seul le dernier reçoit la file.
    if (this.signalQueue.length && !this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        if (!this.signalHandlers.size) return;
        const fresh = this.signalQueue.filter(q => this.ctx.now() - q.at < 15_000);
        this.signalQueue = [];
        for (const q of fresh) this.signalHandlers.forEach(f => f(q.m));
      }, 0);
    }
    return () => { this.signalHandlers.delete(fn); };
  }

  // --- Actions -------------------------------------------------------------

  startCall(args: { mode: CallMode; title?: string; conversationId?: string }): MeetingState {
    if (this.currentMeeting()) throw new MeetingRuleError('Vous êtes déjà dans un appel');
    const id = this.ctx.newId('call');
    const state = createMeeting({
      id, conversationId: args.conversationId ?? `conv-${id}`, title: args.title?.trim() || `Appel de ${this.me.name}`,
      mode: args.mode, host: this.me, now: this.ctx.now(),
    });
    this.meetings.set(id, state);
    this.deps.store.ensure(state.conversationId, state.title, [this.me.id], this.ctx.now());
    this.deps.bus.post({ t: 'snapshot', state });
    this.emit();
    this.trace('call_started', { meetingId: id, mode: args.mode });
    return state;
  }

  /** Envoie une intention à l'hôte ; se résout avec l'état après application. */
  dispatch(meetingId: string, intent: MeetingIntent): Promise<MeetingState> {
    const st = this.meetings.get(meetingId);
    if (!st) return Promise.reject(new MeetingRuleError('Appel introuvable'));
    if (st.hostId === this.me.id) {
      try {
        return Promise.resolve(this.applyAsHost(meetingId, intent));
      } catch (e) {
        this.lastError = (e as Error).message;
        this.emit();
        return Promise.reject(e);
      }
    }
    const reqId = this.ctx.newId('req');
    return new Promise<MeetingState>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error('L\'hôte de l\'appel ne répond pas'));
      }, this.deps.ackTimeoutMs ?? 5000);
      this.pending.set(reqId, { resolve, reject, timer, meetingId });
      this.deps.bus.post({ t: 'intent', meetingId, from: this.me.id, reqId, intent });
    });
  }

  sendSignal(meetingId: string, to: string, data: unknown) {
    this.deps.bus.post({ t: 'signal', meetingId, from: this.me.id, to, data });
  }

  /** Attend la fin des effets en cours (traductions, experts, publication). Utile aux tests. */
  async settle(rounds = 20) {
    for (let i = 0; i < rounds; i++) {
      await new Promise(r => setTimeout(r, 0));
      if (!this.inflight.size) {
        await new Promise(r => setTimeout(r, 0));
        if (!this.inflight.size) return;
      }
      await Promise.allSettled(Array.from(this.inflight));
    }
  }

  dispose() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.unsubscribe();
    this.pending.forEach(p => clearTimeout(p.timer));
    this.listeners.clear();
  }

  // --- Interne -------------------------------------------------------------

  private emit() { this.listeners.forEach(f => f()); }

  private trace(event: string, data: Record<string, unknown>) {
    this.deps.onLog?.(event, { user: this.me.id, ...data });
  }

  private applyAsHost(meetingId: string, intent: MeetingIntent): MeetingState {
    const st = this.meetings.get(meetingId);
    if (!st) throw new MeetingRuleError('Appel introuvable');
    if (st.hostId !== this.me.id) throw new MeetingRuleError('Seul l\'hôte applique les intentions');
    const { state, effects } = reduceMeeting(st, intent, this.ctx);
    this.meetings.set(meetingId, state);
    this.syncConversation(state);
    this.deps.bus.post({ t: 'snapshot', state });
    this.lastError = null;
    this.emit();
    for (const e of effects) this.track(this.runEffect(meetingId, e));
    return state;
  }

  private track(p: Promise<unknown>) {
    this.inflight.add(p);
    p.finally(() => this.inflight.delete(p));
  }

  /** Résultat d'un effet : appliqué seulement si je suis toujours l'hôte. */
  private internal(meetingId: string, intent: MeetingIntent) {
    const st = this.meetings.get(meetingId);
    if (st?.hostId !== this.me.id) { this.trace('effect_dropped_host_changed', { meetingId, type: intent.type }); return; }
    try { this.applyAsHost(meetingId, intent); } catch (e) { this.trace('effect_rejected', { meetingId, type: intent.type, error: (e as Error).message }); }
  }

  private syncConversation(state: MeetingState) {
    const members = state.participants.filter(p => p.kind === 'human' && (p.status === 'joined' || p.status === 'left')).map(p => p.id);
    this.deps.store.ensure(state.conversationId, state.title, members, this.ctx.now());
  }

  private expertContext(state: MeetingState, expertId: string): ExpertContext | null {
    const e = getParticipant(state, expertId);
    if (!e || e.kind !== 'expert' || !e.expertType || !e.expertRole) return null;
    return {
      expertType: e.expertType, expertName: e.name, role: e.expertRole, lang: e.listenLang,
      participants: joinedHumans(state).map(p => p.name),
      // La transcription n'existe que si tous les participants ont accepté la prise de notes.
      transcript: state.transcript.map(c => ({ speaker: c.speakerName, text: c.text, lang: c.sourceLang })),
    };
  }

  private async runEffect(meetingId: string, effect: MeetingEffect): Promise<void> {
    const state = () => this.meetings.get(meetingId)!;
    switch (effect.type) {
      case 'translate': {
        const cap = state().captions.find(c => c.id === effect.captionId);
        if (!cap) return;
        const targets = Object.entries(cap.translations).filter(([, v]) => v?.status === 'pending').map(([k]) => k as LangCode);
        const translations = await this.router.translateAll(cap.text, cap.sourceLang, targets);
        this.internal(meetingId, { type: '_CAPTION_TRANSLATED', captionId: cap.id, translations });
        return;
      }
      case 'translate_item': {
        const item = state().workspace.items.find(i => i.id === effect.itemId);
        if (!item) return;
        const targets = Object.entries(item.translations).filter(([, v]) => v?.status === 'pending').map(([k]) => k as LangCode);
        if (!targets.length) return;
        const translations = await this.router.translateAll(item.text, item.lang, targets);
        this.internal(meetingId, { type: '_ITEM_TRANSLATED', itemId: item.id, sourceText: item.text, translations });
        return;
      }
      case 'expert_answer': {
        const msg = state().expertMessages.find(m => m.id === effect.messageId);
        if (!msg) return;
        const ctx = this.expertContext(state(), msg.expertId);
        if (!ctx) return;
        try {
          const answer = await this.deps.expertEngine.answer({ ...ctx, lang: msg.lang, question: msg.question });
          this.internal(meetingId, { type: '_EXPERT_ANSWER', messageId: msg.id, answer });
        } catch (e) {
          this.trace('expert_answer_failed', { meetingId, error: (e as Error).message });
          this.internal(meetingId, { type: '_EXPERT_ANSWER', messageId: msg.id, failed: true });
        }
        return;
      }
      case 'expert_notes': {
        const ctx = this.expertContext(state(), effect.expertId);
        if (!ctx || !ctx.transcript.length) return;
        try {
          const items = await this.deps.expertEngine.notes(ctx);
          this.internal(meetingId, { type: '_EXPERT_NOTES', expertId: effect.expertId, items });
        } catch (e) {
          this.trace('expert_notes_failed', { meetingId, error: (e as Error).message });
        }
        return;
      }
      case 'expert_recap': {
        const ctx = this.expertContext(state(), effect.expertId);
        if (!ctx || !ctx.transcript.length) return;
        try {
          const text = await this.deps.expertEngine.recap(ctx);
          if (text.trim()) this.internal(meetingId, { type: '_EXPERT_RECAP', expertId: effect.expertId, text });
        } catch (e) {
          this.trace('expert_recap_failed', { meetingId, error: (e as Error).message });
        }
        return;
      }
      case 'publish_report': {
        const s = state();
        const r = s.report;
        if (!r || r.status !== 'validated' || s.publishedReportId === r.id) return;
        this.deps.store.publishReport(s.conversationId, {
          id: r.id, meetingId: s.id, title: `Compte-rendu — ${s.title}`, text: r.text, checksum: r.checksum!,
          validatedAt: r.validatedAt!, approvedBy: Object.keys(r.approvals), authorizedViewers: [...r.authorizedViewers],
        }, this.ctx.now());
        this.internal(meetingId, { type: '_REPORT_PUBLISHED', reportId: r.id });
        return;
      }
    }
  }

  private onMessage(m: BusMessage) {
    switch (m.t) {
      case 'intent': {
        const st = this.meetings.get(m.meetingId);
        if (!st || st.hostId !== this.me.id) return;
        try {
          if (m.intent.type.startsWith('_')) throw new MeetingRuleError('Intention réservée à l\'hôte');
          if (actorOf(m.intent) !== m.from) throw new MeetingRuleError('Un participant ne peut agir qu\'en son propre nom');
          const s = this.applyAsHost(m.meetingId, m.intent);
          this.deps.bus.post({ t: 'ack', to: m.from, reqId: m.reqId, version: s.version });
        } catch (e) {
          this.deps.bus.post({ t: 'error', to: m.from, reqId: m.reqId, message: (e as Error).message });
        }
        return;
      }
      case 'snapshot': {
        const cur = this.meetings.get(m.state.id);
        if (!cur || m.state.version > cur.version) {
          this.meetings.set(m.state.id, m.state);
          this.emit();
        }
        return;
      }
      case 'hello': {
        for (const s of this.meetings.values()) {
          if (s.hostId === this.me.id && s.status === 'active') this.deps.bus.post({ t: 'snapshot', state: s });
        }
        return;
      }
      case 'ack':
      case 'error': {
        if (m.to !== this.me.id) return;
        const p = this.pending.get(m.reqId);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(m.reqId);
        if (m.t === 'ack') p.resolve(this.meetings.get(p.meetingId)!);
        else { this.lastError = m.message; this.emit(); p.reject(new MeetingRuleError(m.message)); }
        return;
      }
      case 'signal': {
        if (m.to !== this.me.id) return;
        if (!this.signalHandlers.size || this.flushTimer) {
          this.signalQueue.push({ at: this.ctx.now(), m });
          if (this.signalQueue.length > 500) this.signalQueue.shift();
        } else {
          this.signalHandlers.forEach(f => f(m));
        }
        return;
      }
    }
  }
}
