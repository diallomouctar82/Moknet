// Conversations d'appel et comptes-rendus validés.
//
// ⚠️ Stockage local (localStorage) : le contrôle d'accès ci-dessous filtre
// l'affichage, il ne protège pas les données. En production, la liste des
// lecteurs autorisés doit être appliquée par le serveur (voir docs).

export interface PublishedReport {
  id: string;
  meetingId: string;
  title: string;
  text: string;
  checksum: string;
  validatedAt: number;
  approvedBy: string[];
  authorizedViewers: string[];
}

export interface ConversationMessage {
  id: string;
  at: number;
  kind: 'system' | 'report';
  text: string;
  report?: PublishedReport;
  visibleTo?: string[];   // absent = visible par tous les membres
}

export interface CallConversation {
  id: string;
  title: string;
  memberIds: string[];
  createdAt: number;
  messages: ConversationMessage[];
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'mok_call_conversations_v1';

export class ConversationStore {
  constructor(private storage: KeyValueStorage) {}

  private readAll(): CallConversation[] {
    try {
      const raw = this.storage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private writeAll(list: CallConversation[]) {
    this.storage.setItem(KEY, JSON.stringify(list));
  }

  ensure(id: string, title: string, memberIds: string[], at: number): CallConversation {
    const all = this.readAll();
    let c = all.find(x => x.id === id);
    if (!c) {
      c = { id, title, memberIds: [...memberIds], createdAt: at, messages: [] };
      all.push(c);
    } else {
      c.memberIds = Array.from(new Set([...c.memberIds, ...memberIds]));
    }
    this.writeAll(all);
    return c;
  }

  addMembers(id: string, memberIds: string[]) {
    const all = this.readAll();
    const c = all.find(x => x.id === id);
    if (!c) return;
    c.memberIds = Array.from(new Set([...c.memberIds, ...memberIds]));
    this.writeAll(all);
  }

  /** Ajoute le compte-rendu validé. Idempotent : un même compte-rendu n'est publié qu'une fois. */
  publishReport(conversationId: string, report: PublishedReport, at: number): boolean {
    const all = this.readAll();
    const c = all.find(x => x.id === conversationId);
    if (!c) throw new Error('Conversation introuvable');
    if (c.messages.some(m => m.report?.id === report.id)) return false;
    c.messages.push({
      id: `msg-${report.id}`, at, kind: 'report', text: report.title, report,
      visibleTo: [...report.authorizedViewers],
    });
    this.writeAll(all);
    return true;
  }

  addSystemMessage(conversationId: string, text: string, at: number) {
    const all = this.readAll();
    const c = all.find(x => x.id === conversationId);
    if (!c) return;
    c.messages.push({ id: `sys-${at}-${c.messages.length}`, at, kind: 'system', text });
    this.writeAll(all);
  }

  /** Conversations dont l'utilisateur est membre, avec uniquement les messages qu'il a le droit de voir. */
  listFor(userId: string): CallConversation[] {
    return this.readAll()
      .filter(c => c.memberIds.includes(userId))
      .map(c => ({ ...c, messages: c.messages.filter(m => canView(m, userId)) }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Nombre de comptes-rendus masqués pour cet utilisateur (pour l'indiquer sans en révéler le contenu). */
  hiddenReportsFor(userId: string, conversationId: string): number {
    const c = this.readAll().find(x => x.id === conversationId);
    if (!c || !c.memberIds.includes(userId)) return 0;
    return c.messages.filter(m => !canView(m, userId)).length;
  }
}

export const canView = (m: ConversationMessage, userId: string) => !m.visibleTo || m.visibleTo.includes(userId);

export class MemoryStorage implements KeyValueStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}
