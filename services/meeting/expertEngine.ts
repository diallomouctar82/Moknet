// Comportement des experts MokNet invités dans un appel.
// - Conseiller : répond uniquement quand un participant le sollicite.
// - Preneur de notes : extrait décisions et actions de la transcription (consentie).
// - Récap en direct : tient à jour un résumé, sans jamais prendre la parole.

import { ExpertType } from '../../types';
import { LangCode } from './languages';
import { ExpertMeetingRole, WorkspaceSection } from './types';
import { parseWorkspaceCommand } from './commandParser';

export interface TranscriptLine { speaker: string; text: string; lang: LangCode }

export interface ExpertContext {
  expertType: ExpertType;
  expertName: string;
  role: ExpertMeetingRole;
  lang: LangCode;                 // langue de sortie attendue
  participants: string[];
  transcript: TranscriptLine[];
}

export interface ExtractedNote { section: WorkspaceSection; text: string; owner?: string; due?: string }

export interface ExpertEngine {
  answer(ctx: ExpertContext & { question: string }): Promise<string>;
  notes(ctx: ExpertContext): Promise<ExtractedNote[]>;
  recap(ctx: ExpertContext): Promise<string>;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const DECISION_HINTS = /\b(on a decide|nous avons decide|on retient|c'est valide|decide|we decided|agreed|we agree|decidimos|acordamos|queda aprobado)\b/;
const ACTION_HINTS = /\b(va envoyer|va faire|va preparer|doit|s'occupe|se charge|will send|will prepare|will do|must|is going to|se encarga|enviara|preparara|va a)\b/;

/**
 * Moteur sans IA, déterministe : sert de repli quand le service IA est
 * indisponible (et de référence dans les tests). Il ne fait que reprendre ce
 * qui a été dit, il n'invente rien.
 */
export class RuleBasedExpertEngine implements ExpertEngine {
  async answer(): Promise<string> {
    throw new Error('Expert IA indisponible : le service Gemini n\'est pas configuré');
  }

  async notes(ctx: ExpertContext): Promise<ExtractedNote[]> {
    const out: ExtractedNote[] = [];
    for (const line of ctx.transcript) {
      const cmd = parseWorkspaceCommand(line.text, { participantNames: ctx.participants, columnNames: [], strict: true });
      if (cmd?.kind === 'add' && cmd.section !== 'recap') {
        out.push({ section: cmd.section, text: cmd.text, owner: cmd.owner, due: cmd.due });
        continue;
      }
      const f = fold(line.text);
      if (DECISION_HINTS.test(f)) out.push({ section: 'decisions', text: line.text });
      else if (ACTION_HINTS.test(f)) {
        const owner = ctx.participants.find(n => f.includes(fold(n.split(' ')[0]))) ?? line.speaker;
        out.push({ section: 'actions', text: line.text, owner });
      }
    }
    return out;
  }

  async recap(ctx: ExpertContext): Promise<string> {
    const last = ctx.transcript.slice(-8);
    if (!last.length) return '';
    return last.map(l => `• ${l.speaker} : ${l.text}`).join('\n');
  }
}
