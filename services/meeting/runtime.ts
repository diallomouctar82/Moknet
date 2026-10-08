// Branchement des services réels (Gemini) ou de repli, selon la configuration.

import { getLanguage, LangCode } from './languages';
import { Translator } from './translationRouter';
import { ExpertContext, ExpertEngine, ExtractedNote, RuleBasedExpertEngine } from './expertEngine';
import { hasGeminiKey, translateText, meetingExpertAnswer, meetingExpertNotes, meetingExpertRecap } from '../geminiService';

const langName = (c: LangCode) => getLanguage(c)?.englishName ?? c;
const lines = (ctx: ExpertContext) => ctx.transcript.map(l => ({ speaker: l.speaker, text: l.text }));

export class GeminiTranslator implements Translator {
  translate(text: string, from: LangCode, to: LangCode, signal?: AbortSignal) {
    return translateText(text, langName(from), langName(to), signal);
  }
}

/**
 * Traduction SIMULÉE, utilisée uniquement quand aucune clé Gemini n'est
 * configurée : elle préfixe le texte par la langue cible pour montrer le
 * routage, et l'interface l'affiche comme « simulée ». Ce n'est pas une traduction.
 */
export class SimulatedTranslator implements Translator {
  async translate(text: string, _from: LangCode, to: LangCode) {
    return `[${to.toUpperCase()} · simulé] ${text}`;
  }
}

/** Expert propulsé par Gemini ; notes et récap retombent sur les règles si le service échoue. */
export class GeminiExpertEngine implements ExpertEngine {
  constructor(private fallback = new RuleBasedExpertEngine(), private onFallback?: (what: string, e: unknown) => void) {}

  answer(ctx: ExpertContext & { question: string }) {
    return meetingExpertAnswer(ctx.expertType, langName(ctx.lang), ctx.question, lines(ctx));
  }

  async notes(ctx: ExpertContext): Promise<ExtractedNote[]> {
    try {
      return await meetingExpertNotes(ctx.expertType, langName(ctx.lang), lines(ctx));
    } catch (e) {
      this.onFallback?.('notes', e);
      return this.fallback.notes(ctx);
    }
  }

  async recap(ctx: ExpertContext): Promise<string> {
    try {
      return await meetingExpertRecap(ctx.expertType, langName(ctx.lang), lines(ctx));
    } catch (e) {
      this.onFallback?.('recap', e);
      return this.fallback.recap(ctx);
    }
  }
}

export type AiMode = 'gemini' | 'offline';

export const createAiServices = (log?: (event: string, data: Record<string, unknown>) => void): {
  mode: AiMode; translator: Translator; expertEngine: ExpertEngine;
} => {
  if (hasGeminiKey()) {
    return {
      mode: 'gemini',
      translator: new GeminiTranslator(),
      expertEngine: new GeminiExpertEngine(undefined, (what, e) => log?.('expert_fallback', { what, error: String((e as Error)?.message ?? e) })),
    };
  }
  return { mode: 'offline', translator: new SimulatedTranslator(), expertEngine: new RuleBasedExpertEngine() };
};
