import { ExpertType } from '../../types';
import { LangCode } from './languages';
import { CalcCheck } from './calc';

export type CallMode = 'audio' | 'video';
export type ParticipantKind = 'human' | 'expert';
export type ParticipantStatus = 'invited' | 'joined' | 'declined' | 'left';

/** Compétences de collaboration d'un expert MokNet invité dans un appel. */
export type ExpertMeetingRole = 'ADVISOR' | 'NOTE_TAKER' | 'LIVE_RECAP';

export const EXPERT_ROLE_LABELS: Record<ExpertMeetingRole, string> = {
  ADVISOR: 'Conseiller (répond quand on le sollicite)',
  NOTE_TAKER: 'Preneur de notes (silencieux)',
  LIVE_RECAP: 'Récap en direct (silencieux)',
};

/** Rôles qui exploitent la transcription : ils exigent le consentement de tous. */
export const ROLES_REQUIRING_CONSENT: ExpertMeetingRole[] = ['NOTE_TAKER', 'LIVE_RECAP'];

export interface Person { id: string; name: string; lang: LangCode }

export interface Participant {
  id: string;               // id utilisateur, ou "expert:<TYPE>"
  kind: ParticipantKind;
  name: string;
  status: ParticipantStatus;
  listenLang: LangCode;     // langue des sous-titres reçus
  speakLang: LangCode;      // langue parlée (dictée, traduction source)
  expertType?: ExpertType;
  expertRole?: ExpertMeetingRole;
  invitedBy?: string;
  invitedAt?: number;
  joinedAt?: number;
  leftAt?: number;
  muted?: boolean;
  camOn?: boolean;
}

export type ConsentAnswer = 'pending' | 'accepted' | 'refused';

export interface NoteTakingState {
  /**
   * off       : aucune prise de notes.
   * requested : annoncée, en attente de l'accord de chaque participant.
   * active    : tous les participants présents ont accepté → la transcription est conservée.
   * paused    : un nouveau participant n'a pas encore répondu → rien n'est conservé.
   * refused   : au moins un refus → rien n'est conservé.
   */
  status: 'off' | 'requested' | 'active' | 'paused' | 'refused';
  requestedBy?: string;
  announcement?: string;
  consents: Record<string, ConsentAnswer>;
}

export type TranslationStatus = 'ok' | 'pending' | 'failed';

export interface Caption {
  id: string;
  speakerId: string;
  speakerName: string;
  sourceLang: LangCode;
  text: string;
  at: number;
  translations: Partial<Record<LangCode, { status: TranslationStatus; text?: string; experimental?: boolean }>>;
  kind?: 'speech' | 'expert';
}

export type WorkspaceSection = 'recap' | 'decisions' | 'actions';

export interface WorkspaceItem {
  id: string;
  section: WorkspaceSection;
  text: string;
  owner?: string;
  due?: string;
  authorId: string;
  authorName: string;
  aiGenerated: boolean;
  confirmedBy: string[];
  uncertain: boolean;
  reasons: string[];
  calcChecks: CalcCheck[];
  via: 'voice' | 'text' | 'expert';
  lang: LangCode;                 // langue dans laquelle l'élément a été écrit
  translations: Partial<Record<LangCode, { status: TranslationStatus; text?: string; experimental?: boolean }>>;
  createdAt: number;
  updatedAt: number;
  history: Array<{ by: string; at: number; text: string }>;
}

export type ColumnType = 'text' | 'number' | 'computed';

export interface TableColumn {
  id: string;
  name: string;
  type: ColumnType;
  formula?: string;
  /** Totaliser la colonne (faux pour un prix unitaire, un taux…). Par défaut : vrai. */
  sum?: boolean;
}

export interface TableRow {
  id: string;
  cells: Record<string, string>;   // par nom de colonne
  authorId: string;
  updatedAt: number;
}

export interface ComputedTable {
  rows: Array<{ id: string; computed: Record<string, string | null>; issues: string[] }>;
  totals: Record<string, string | null>;
  issues: string[];
}

export interface SharedTable {
  title: string;
  columns: TableColumn[];
  rows: TableRow[];
}

export interface Workspace { items: WorkspaceItem[]; table: SharedTable }

export type ApprovalAnswer = 'pending' | 'approved' | 'changes_requested';

export interface MeetingReport {
  id: string;
  status: 'pending_approval' | 'validated' | 'changes_requested';
  text: string;
  proposedBy: string;
  proposedAt: number;
  approvals: Record<string, ApprovalAnswer>;
  comments: Array<{ by: string; at: number; text: string }>;
  authorizedViewers: string[];
  validatedAt?: number;
  checksum?: string;
}

export interface ExpertMessage {
  id: string;
  expertId: string;
  expertName: string;
  askedBy: string;
  question: string;
  answer?: string;
  lang: LangCode;
  status: 'pending' | 'answered' | 'failed';
  at: number;
}

export interface MeetingLogEntry { at: number; text: string; kind: 'info' | 'consent' | 'warning' }

export interface MeetingState {
  id: string;
  conversationId: string;
  title: string;
  mode: CallMode;
  hostId: string;
  status: 'active' | 'ended';
  createdAt: number;
  endedAt?: number;
  participants: Participant[];
  noteTaking: NoteTakingState;
  captions: Caption[];      // direct, éphémère (20 dernières)
  transcript: Caption[];    // conservé uniquement avec consentement de tous
  expertMessages: ExpertMessage[];
  workspace: Workspace;
  report?: MeetingReport;
  publishedReportId?: string;
  log: MeetingLogEntry[];
  utterancesSinceNotes: number;
  version: number;
}

// --- Intentions envoyées par les participants (et résultats d'effets) ---

export type MeetingIntent =
  | { type: 'INVITE_PERSON'; by: string; person: Person }
  | { type: 'INVITE_EXPERT'; by: string; expertType: ExpertType; role: ExpertMeetingRole }
  | { type: 'RESPOND_INVITE'; userId: string; accept: boolean }
  | { type: 'LEAVE'; userId: string }
  | { type: 'END'; by: string }
  | { type: 'SET_MODE'; by: string; mode: CallMode }
  | { type: 'SET_LANG'; userId: string; listenLang?: LangCode; speakLang?: LangCode }
  | { type: 'SET_MEDIA'; userId: string; muted?: boolean; camOn?: boolean }
  | { type: 'REQUEST_NOTES'; by: string }
  | { type: 'CONSENT'; userId: string; accept: boolean }
  | { type: 'STOP_NOTES'; by: string }
  | { type: 'UTTERANCE'; userId: string; text: string; lang?: LangCode }
  | { type: 'ASK_EXPERT'; by: string; expertId: string; question: string }
  | { type: 'REFRESH_EXPERT'; by: string; expertId: string }
  | { type: 'WS_ADD_ITEM'; by: string; section: WorkspaceSection; text: string; owner?: string; due?: string; via?: 'voice' | 'text' }
  | { type: 'WS_EDIT_ITEM'; by: string; itemId: string; text: string; owner?: string; due?: string; via?: 'voice' | 'text' }
  | { type: 'WS_CONFIRM_ITEM'; by: string; itemId: string }
  | { type: 'WS_DELETE_ITEM'; by: string; itemId: string }
  | { type: 'WS_TABLE_SETUP'; by: string; title: string; columns: Array<Omit<TableColumn, 'id'>> }
  | { type: 'WS_TABLE_ADD_ROW'; by: string; cells: Record<string, string> }
  | { type: 'WS_TABLE_EDIT_CELL'; by: string; rowId: string; column: string; value: string }
  | { type: 'WS_TABLE_DELETE_ROW'; by: string; rowId: string }
  | { type: 'REPORT_PROPOSE'; by: string }
  | { type: 'REPORT_APPROVE'; userId: string }
  | { type: 'REPORT_REQUEST_CHANGES'; userId: string; comment: string }
  // Résultats d'effets, émis uniquement par l'hôte :
  | { type: '_CAPTION_TRANSLATED'; captionId: string; translations: Caption['translations'] }
  | { type: '_ITEM_TRANSLATED'; itemId: string; sourceText: string; translations: WorkspaceItem['translations'] }
  | { type: '_EXPERT_ANSWER'; messageId: string; answer?: string; failed?: boolean }
  | { type: '_EXPERT_NOTES'; expertId: string; items: Array<{ section: WorkspaceSection; text: string; owner?: string; due?: string }> }
  | { type: '_EXPERT_RECAP'; expertId: string; text: string }
  | { type: '_REPORT_PUBLISHED'; reportId: string };

export type MeetingEffect =
  | { type: 'translate'; captionId: string }
  | { type: 'translate_item'; itemId: string }
  | { type: 'expert_answer'; messageId: string }
  | { type: 'expert_notes'; expertId: string }
  | { type: 'expert_recap'; expertId: string }
  | { type: 'publish_report' };

export class MeetingRuleError extends Error {}
