import { ExpertEngine, ExpertContext, RuleBasedExpertEngine } from '../../services/meeting/expertEngine';
import { Translator } from '../../services/meeting/translationRouter';
import { LangCode } from '../../services/meeting/languages';
import { CoreCtx } from '../../services/meeting/meetingCore';

/** Traducteur de test : déterministe, préfixe la langue cible. Il ne prétend pas traduire. */
export class FakeTranslator implements Translator {
  calls: Array<{ text: string; from: LangCode; to: LangCode }> = [];
  failOn = new Set<LangCode>();
  delayMs = 0;
  async translate(text: string, from: LangCode, to: LangCode) {
    this.calls.push({ text, from, to });
    if (this.delayMs) await new Promise(r => setTimeout(r, this.delayMs));
    if (this.failOn.has(to)) throw new Error(`service indisponible pour ${to}`);
    return `[${to}] ${text}`;
  }
}

/** Expert de test : réponse déterministe dans la langue demandée, notes et récap par règles. */
export class FakeExpertEngine implements ExpertEngine {
  rules = new RuleBasedExpertEngine();
  answers: Array<ExpertContext & { question: string }> = [];
  async answer(ctx: ExpertContext & { question: string }) {
    this.answers.push(ctx);
    return `(${ctx.lang}) ${ctx.expertName} : réponse à « ${ctx.question} »`;
  }
  notes(ctx: ExpertContext) { return this.rules.notes(ctx); }
  recap(ctx: ExpertContext) { return this.rules.recap(ctx); }
}

export const testCtx = (): CoreCtx & { tick: (ms?: number) => void } => {
  let t = Date.UTC(2026, 9, 8, 10, 0, 0);
  let n = 0;
  return { now: () => t, newId: (p: string) => `${p}-${++n}`, tick: (ms = 1000) => { t += ms; } };
};
