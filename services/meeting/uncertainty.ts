// Signalement des informations incertaines dans l'espace partagé.
// Une information est incertaine si son auteur l'exprime avec une hésitation,
// si elle contient un nombre ambigu, ou si elle vient d'un expert IA et n'a pas
// encore été confirmée par un participant humain.

import { verifyInlineCalculations, parseLocaleNumber, CalcCheck } from './calc';

// Frontières de mots compatibles avec les lettres accentuées (\b ne les gère pas).
const words = (list: string[]) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(${list.join('|')})(?![\\p{L}\\p{N}])`, 'iu');

const HEDGES: Array<{ re: RegExp; label: string }> = [
  // Français
  { re: words(['environ', 'à peu près', 'approximativement', 'peut[- ]être', 'sans doute', 'probablement', 'je crois', 'je pense', 'il me semble', 'à vérifier', 'à confirmer', 'non confirmée?', 'pas sûr', 'incertaine?']), label: 'formulation incertaine' },
  // English
  { re: words(['maybe', 'perhaps', 'probably', 'approximately', 'roughly', 'i think', 'i guess', 'not sure', 'tbd', 'tbc', 'to be confirmed', 'unconfirmed']), label: 'formulation incertaine' },
  // Español
  { re: words(['quizás', 'quizá', 'tal vez', 'aproximadamente', 'probablemente', 'creo que', 'por confirmar', 'no estoy seguro']), label: 'formulation incertaine' },
  // Approximation devant un nombre
  { re: /(?<![\p{L}])(about|around|vers|cerca de)\s+\d/iu, label: 'approximation chiffrée' },
  // Symboles
  { re: /[~≈?]/, label: "point d'interrogation ou approximation (~, ≈)" },
];

export interface UncertaintyAssessment {
  uncertain: boolean;
  reasons: string[];
  calcChecks: CalcCheck[];
}

/** Analyse un texte saisi (voix ou écrit) et liste les raisons de le signaler. */
export const assessText = (text: string, opts: { aiGenerated?: boolean } = {}): UncertaintyAssessment => {
  const reasons: string[] = [];
  for (const h of HEDGES) {
    const m = h.re.exec(text);
    if (m) reasons.push(`${h.label} : « ${m[0]} »`);
  }
  const numberTokens = text.match(/\d+(?:[.,]\d+)+/g) || [];
  for (const tok of numberTokens) {
    const p = parseLocaleNumber(tok);
    if (p.ambiguous && p.reason) reasons.push(p.reason);
  }
  const calcChecks = verifyInlineCalculations(text);
  for (const c of calcChecks) if (!c.ok) reasons.push(c.message);
  if (opts.aiGenerated) reasons.push('proposé par un expert IA — à confirmer par un participant');
  return { uncertain: reasons.length > 0, reasons: Array.from(new Set(reasons)), calcChecks };
};
