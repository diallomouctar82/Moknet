// Calculs vérifiés par le logiciel.
//
// Toute valeur chiffrée de l'espace partagé (totaux du tableau, égalités écrites
// dans le récap, les décisions ou le plan d'action) est recalculée ici, en
// arithmétique décimale exacte (bigint), jamais en flottants ni par une IA.

export interface Dec { n: bigint; s: number } // valeur = n / 10^s

const DIV_SCALE = 12;
const pow10 = (k: number): bigint => 10n ** BigInt(k);

const normalize = (d: Dec): Dec => {
  let { n, s } = d;
  while (s > 0 && n % 10n === 0n) { n /= 10n; s -= 1; }
  return { n, s };
};

const align = (a: Dec, b: Dec): [bigint, bigint, number] => {
  const s = Math.max(a.s, b.s);
  return [a.n * pow10(s - a.s), b.n * pow10(s - b.s), s];
};

const divRound = (num: bigint, den: bigint): bigint => {
  const neg = (num < 0n) !== (den < 0n);
  const an = num < 0n ? -num : num;
  const ad = den < 0n ? -den : den;
  let q = an / ad;
  if ((an % ad) * 2n >= ad) q += 1n;
  return neg ? -q : q;
};

export const dec = {
  add: (a: Dec, b: Dec): Dec => { const [x, y, s] = align(a, b); return normalize({ n: x + y, s }); },
  sub: (a: Dec, b: Dec): Dec => { const [x, y, s] = align(a, b); return normalize({ n: x - y, s }); },
  mul: (a: Dec, b: Dec): Dec => normalize({ n: a.n * b.n, s: a.s + b.s }),
  div: (a: Dec, b: Dec): Dec => {
    if (b.n === 0n) throw new CalcError('Division par zéro');
    const num = a.n * pow10(b.s + DIV_SCALE);
    const den = b.n * pow10(a.s);
    return normalize({ n: divRound(num, den), s: DIV_SCALE });
  },
  fromInt: (i: number): Dec => ({ n: BigInt(i), s: 0 }),
  zero: (): Dec => ({ n: 0n, s: 0 }),
};

export class CalcError extends Error {}

/** Représentation canonique "1234.5" (point décimal, sans séparateur de milliers). */
export const toCanonical = (d: Dec): string => {
  const { n, s } = normalize(d);
  const neg = n < 0n;
  const digits = (neg ? -n : n).toString().padStart(s + 1, '0');
  const int = s ? digits.slice(0, digits.length - s) : digits;
  const frac = s ? digits.slice(digits.length - s) : '';
  return `${neg ? '-' : ''}${int}${frac ? '.' + frac : ''}`;
};

/** Arrondi à `decimals` chiffres (demi vers l'extérieur). */
export const roundDec = (d: Dec, decimals: number): Dec => {
  if (d.s <= decimals) return normalize(d);
  return normalize({ n: divRound(d.n, pow10(d.s - decimals)), s: decimals });
};

/** Affichage localisé : fr → "1 234,5", en → "1,234.5". */
export const formatDec = (d: Dec, lang: string = 'fr', maxDecimals = 2): string => {
  const canon = toCanonical(roundDec(d, maxDecimals));
  const [rawInt, frac] = canon.replace('-', '').split('.');
  const neg = canon.startsWith('-');
  const group = lang === 'en' ? ',' : lang === 'es' ? '.' : '\u202f';
  const decimal = lang === 'en' ? '.' : ',';
  const int = rawInt.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${neg ? '-' : ''}${int}${frac ? decimal + frac : ''}`;
};

export interface ParsedNumber {
  value: Dec | null;
  ambiguous: boolean;      // ex. "1,500" : 1,5 (fr) ou 1500 (en) ?
  reason?: string;
}

const SPACE_CHARS = /[\s\u00a0\u202f]/g;

/**
 * Lit un nombre écrit à la française, à l'anglaise ou avec espaces de milliers.
 * Les écritures ambiguës sont lues comme décimales et marquées `ambiguous`.
 */
export const parseLocaleNumber = (raw: string): ParsedNumber => {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { value: null, ambiguous: false, reason: 'vide' };
  let t = trimmed.replace(/(gnf|fcfa|xof|eur|usd|€|\$|%)/gi, '').replace(SPACE_CHARS, '');
  let sign = 1n;
  if (t.startsWith('-')) { sign = -1n; t = t.slice(1); } else if (t.startsWith('+')) { t = t.slice(1); }
  if (!/^\d[\d.,]*$/.test(t) || /[.,]$/.test(t)) {
    return { value: null, ambiguous: false, reason: `« ${trimmed} » n'est pas un nombre` };
  }
  const commas = (t.match(/,/g) || []).length;
  const dots = (t.match(/\./g) || []).length;
  let intPart = t;
  let fracPart = '';
  let ambiguous = false;
  let reason: string | undefined;

  const splitOn = (sep: string) => {
    const i = t.lastIndexOf(sep);
    intPart = t.slice(0, i);
    fracPart = t.slice(i + 1);
  };

  if (commas && dots) {
    const decimalSep = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.';
    const groupSep = decimalSep === ',' ? '.' : ',';
    if ((t.match(new RegExp('\\' + decimalSep, 'g')) || []).length > 1) {
      return { value: null, ambiguous: false, reason: `« ${trimmed} » mélange les séparateurs` };
    }
    splitOn(decimalSep);
    intPart = intPart.split(groupSep).join('');
  } else if (commas || dots) {
    const sep = commas ? ',' : '.';
    const count = commas || dots;
    if (count > 1) {
      // "1.500.000" ou "1,500,000" : séparateurs de milliers.
      const groups = t.split(sep);
      if (groups.slice(1).some(g => g.length !== 3)) {
        return { value: null, ambiguous: false, reason: `« ${trimmed} » : groupes de milliers invalides` };
      }
      intPart = groups.join('');
    } else {
      splitOn(sep);
      if (fracPart.length === 3 && intPart.length <= 3 && intPart !== '0') {
        ambiguous = true;
        reason = `« ${trimmed} » est ambigu (décimale ou milliers ?) — lu comme ${intPart},${fracPart}`;
      }
    }
  }
  if (!/^\d+$/.test(intPart || '0') || (fracPart && !/^\d+$/.test(fracPart))) {
    return { value: null, ambiguous: false, reason: `« ${trimmed} » n'est pas un nombre` };
  }
  const n = BigInt((intPart || '0') + fracPart) * sign;
  return { value: normalize({ n, s: fracPart.length }), ambiguous, reason };
};

// --- Évaluation d'expressions (sans eval) ---------------------------------

type Tok = { k: 'num'; v: Dec } | { k: 'op'; v: '+' | '-' | '*' | '/' | 'neg' } | { k: 'lp' } | { k: 'rp' } | { k: 'pct' };

const NUMBER_RE = /^(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)*)/;

const tokenize = (expr: string): { tokens: Tok[]; ambiguous: string[] } => {
  const tokens: Tok[] = [];
  const ambiguous: string[] = [];
  let i = 0;
  const src = expr.trim();
  while (i < src.length) {
    const c = src[i];
    if (/[\s\u00a0\u202f]/.test(c)) { i++; continue; }
    const m = NUMBER_RE.exec(src.slice(i));
    if (m) {
      const p = parseLocaleNumber(m[0]);
      if (!p.value) throw new CalcError(p.reason || `Nombre invalide : ${m[0]}`);
      if (p.ambiguous && p.reason) ambiguous.push(p.reason);
      tokens.push({ k: 'num', v: p.value });
      i += m[0].length;
      continue;
    }
    if (c === '(') { tokens.push({ k: 'lp' }); i++; continue; }
    if (c === ')') { tokens.push({ k: 'rp' }); i++; continue; }
    if (c === '%') { tokens.push({ k: 'pct' }); i++; continue; }
    const opMap: Record<string, '+' | '-' | '*' | '/'> = { '+': '+', '-': '-', '−': '-', '*': '*', '×': '*', 'x': '*', 'X': '*', '/': '/', '÷': '/' };
    if (opMap[c]) {
      const prev = tokens[tokens.length - 1];
      const unary = opMap[c] === '-' && (!prev || prev.k === 'op' || prev.k === 'lp');
      tokens.push({ k: 'op', v: unary ? 'neg' : opMap[c] });
      i++;
      continue;
    }
    throw new CalcError(`Caractère inattendu « ${c} »`);
  }
  return { tokens, ambiguous };
};

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, neg: 3 };

export interface EvalResult { value: Dec; ambiguous: string[] }

/** Évalue une expression arithmétique (+ - × ÷, parenthèses, pourcentages). */
export const evaluate = (expr: string): EvalResult => {
  const { tokens, ambiguous } = tokenize(expr);
  if (!tokens.length) throw new CalcError('Expression vide');
  const out: Dec[] = [];
  const ops: Array<Tok> = [];
  const apply = (op: string) => {
    if (op === 'neg') {
      const a = out.pop(); if (!a) throw new CalcError('Expression incomplète');
      out.push({ n: -a.n, s: a.s });
      return;
    }
    const b = out.pop(); const a = out.pop();
    if (!a || !b) throw new CalcError('Expression incomplète');
    out.push(op === '+' ? dec.add(a, b) : op === '-' ? dec.sub(a, b) : op === '*' ? dec.mul(a, b) : dec.div(a, b));
  };
  let expectOperand = true;
  for (const t of tokens) {
    if (t.k === 'num') {
      if (!expectOperand) throw new CalcError('Deux nombres se suivent');
      out.push(t.v); expectOperand = false;
    } else if (t.k === 'pct') {
      const a = out.pop(); if (!a || expectOperand) throw new CalcError('% mal placé');
      out.push(dec.div(a, dec.fromInt(100)));
    } else if (t.k === 'lp') {
      ops.push(t); expectOperand = true;
    } else if (t.k === 'rp') {
      while (ops.length && ops[ops.length - 1].k !== 'lp') apply((ops.pop() as any).v);
      if (!ops.length) throw new CalcError('Parenthèse fermante en trop');
      ops.pop(); expectOperand = false;
    } else {
      if (t.v === 'neg') { ops.push(t); continue; }
      if (expectOperand) throw new CalcError('Opérateur mal placé');
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.k !== 'op') break;
        if (PREC[top.v] >= PREC[t.v]) apply((ops.pop() as any).v); else break;
      }
      ops.push(t); expectOperand = true;
    }
  }
  while (ops.length) {
    const top = ops.pop()!;
    if (top.k === 'lp') throw new CalcError('Parenthèse non fermée');
    apply((top as any).v);
  }
  if (out.length !== 1) throw new CalcError('Expression invalide');
  return { value: out[0], ambiguous };
};

/** Vrai si `claimed` est un arrondi correct de `computed` à la précision écrite. */
export const matchesClaim = (computed: Dec, claimed: Dec): boolean => {
  const decimals = claimed.s;
  return toCanonical(roundDec(computed, decimals)) === toCanonical(claimed);
};

export interface CalcCheck {
  expression: string;
  claimed: string;
  computed: string | null; // canonique
  ok: boolean;
  message: string;
}

// "a op b [op c ...] = résultat" dans un texte libre.
const NUM = String.raw`\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)*`;
const OPERAND = String.raw`\(?\s*-?${NUM}%?\s*\)?`;
const EQUATION_RE = new RegExp(String.raw`(${OPERAND}(?:\s*[+\-−*/×xX÷]\s*${OPERAND})+)\s*=\s*(-?${NUM})`, 'g');

const cleanTail = (s: string) => s.replace(/[\s\u00a0\u202f.,]+$/, '');

/** Repère et recalcule chaque égalité écrite dans un texte. */
export const verifyInlineCalculations = (text: string): CalcCheck[] => {
  const checks: CalcCheck[] = [];
  if (!text) return checks;
  EQUATION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EQUATION_RE.exec(text))) {
    const expression = cleanTail(m[1]).trim();
    const claimedRaw = cleanTail(m[2]).trim();
    try {
      const { value } = evaluate(expression);
      const claimed = parseLocaleNumber(claimedRaw);
      if (!claimed.value) throw new CalcError(claimed.reason || 'Résultat illisible');
      const ok = matchesClaim(value, claimed.value);
      checks.push({
        expression, claimed: claimedRaw, computed: toCanonical(value), ok,
        message: ok
          ? `Calcul vérifié : ${expression} = ${claimedRaw}`
          : `Calcul faux : ${expression} = ${formatDec(value, 'fr')} (et non ${claimedRaw})`,
      });
    } catch (e) {
      checks.push({ expression, claimed: claimedRaw, computed: null, ok: false, message: `Calcul illisible : ${(e as Error).message}` });
    }
  }
  return checks;
};

/**
 * Évalue une formule de colonne du tableau partagé, ex. "{Quantité} * {Prix unitaire}".
 * Chaque référence est remplacée par la valeur décimale exacte de la cellule.
 */
export const evaluateFormula = (formula: string, cells: Record<string, string>): { value: Dec | null; error?: string; ambiguous: string[] } => {
  const ambiguous: string[] = [];
  let missing: string | null = null;
  const expr = formula.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const raw = cells[name.trim()];
    const p = parseLocaleNumber(raw ?? '');
    if (!p.value) { missing = missing ?? `« ${name.trim()} » : ${p.reason}`; return '0'; }
    if (p.ambiguous && p.reason) ambiguous.push(p.reason);
    return `(${toCanonical(p.value)})`;
  });
  if (missing) return { value: null, error: missing, ambiguous };
  try {
    const r = evaluate(expr);
    return { value: r.value, ambiguous: [...ambiguous, ...r.ambiguous] };
  } catch (e) {
    return { value: null, error: (e as Error).message, ambiguous };
  }
};
