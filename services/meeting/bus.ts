// Canal de messages entre les participants d'un appel.
//
// - BroadcastBus : entre onglets d'un même navigateur (démonstration, tests E2E).
// - MemoryHub    : en mémoire (tests unitaires).
// En production, ce canal doit être un service temps réel côté serveur
// (WebSocket ou équivalent) : voir docs/APPELS_MULTI_PARTICIPANTS.md.

import { MeetingIntent, MeetingState } from './types';

export type BusMessage =
  | { t: 'intent'; meetingId: string; from: string; reqId: string; intent: MeetingIntent }
  | { t: 'ack'; to: string; reqId: string; version: number }
  | { t: 'error'; to: string; reqId: string; message: string }
  | { t: 'snapshot'; from: string; state: MeetingState }
  | { t: 'hello'; from: string; reply?: boolean }
  | { t: 'signal'; meetingId: string; from: string; to: string; data: any };

export interface Bus {
  post(msg: BusMessage): void;
  subscribe(fn: (msg: BusMessage) => void): () => void;
  close(): void;
}

export class BroadcastBus implements Bus {
  private ch: BroadcastChannel;
  private fns = new Set<(m: BusMessage) => void>();
  constructor(name = 'moknet-calls-v1') {
    this.ch = new BroadcastChannel(name);
    this.ch.onmessage = (e: MessageEvent) => this.fns.forEach(f => f(e.data as BusMessage));
  }
  post(msg: BusMessage) { this.ch.postMessage(msg); }
  subscribe(fn: (m: BusMessage) => void) { this.fns.add(fn); return () => { this.fns.delete(fn); }; }
  close() { this.fns.clear(); this.ch.close(); }
}

/** Réplique en mémoire de BroadcastChannel : livraison asynchrone, jamais à l'émetteur. */
export class MemoryHub {
  private endpoints = new Set<{ fns: Set<(m: BusMessage) => void> }>();
  public delivered = 0;
  endpoint(): Bus {
    const ep = { fns: new Set<(m: BusMessage) => void>() };
    this.endpoints.add(ep);
    return {
      post: (msg) => {
        const copy = structuredClone(msg);
        for (const other of this.endpoints) {
          if (other === ep) continue;
          queueMicrotask(() => { this.delivered++; other.fns.forEach(f => f(structuredClone(copy))); });
        }
      },
      subscribe: (fn) => { ep.fns.add(fn); return () => { ep.fns.delete(fn); }; },
      close: () => { ep.fns.clear(); this.endpoints.delete(ep); },
    };
  }
}
