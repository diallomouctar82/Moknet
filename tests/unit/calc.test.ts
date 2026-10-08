import { describe, it, expect } from 'vitest';
import { evaluate, toCanonical, parseLocaleNumber, verifyInlineCalculations, evaluateFormula, formatDec, CalcError } from '../../services/meeting/calc';
import { computeTable, validateColumns } from '../../services/meeting/workspace';

const ev = (e: string) => toCanonical(evaluate(e).value);

describe('arithmétique décimale exacte', () => {
  it('ne souffre pas des erreurs de flottants', () => {
    expect(ev('0.1 + 0.2')).toBe('0.3');
    expect(ev('1,1 × 3')).toBe('3.3');
  });
  it('respecte priorités, parenthèses, signes et pourcentages', () => {
    expect(ev('2 + 3 * 4')).toBe('14');
    expect(ev('(2 + 3) x 4')).toBe('20');
    expect(ev('-5 * 3')).toBe('-15');
    expect(ev('3 * -5')).toBe('-15');
    expect(ev('2000 * 15%')).toBe('300');
    expect(ev('10 ÷ 4')).toBe('2.5');
    expect(ev('1 500 × 3')).toBe('4500');
  });
  it('refuse les expressions invalides et la division par zéro', () => {
    expect(() => evaluate('5 / 0')).toThrow(CalcError);
    expect(() => evaluate('2 +')).toThrow(CalcError);
    expect(() => evaluate('(2 + 3')).toThrow(CalcError);
    expect(() => evaluate('2 & 3')).toThrow(CalcError);
  });
});

describe('lecture des nombres', () => {
  it('comprend les écritures française, anglaise et à espaces', () => {
    expect(toCanonical(parseLocaleNumber('1 234,50').value!)).toBe('1234.5');
    expect(toCanonical(parseLocaleNumber('1,234.50').value!)).toBe('1234.5');
    expect(toCanonical(parseLocaleNumber('1.234,50').value!)).toBe('1234.5');
    expect(toCanonical(parseLocaleNumber('2.000.000').value!)).toBe('2000000');
    expect(toCanonical(parseLocaleNumber('15 000 GNF').value!)).toBe('15000');
  });
  it('signale les écritures ambiguës', () => {
    const p = parseLocaleNumber('1,500');
    expect(p.ambiguous).toBe(true);
    expect(toCanonical(p.value!)).toBe('1.5');
    expect(parseLocaleNumber('0,500').ambiguous).toBe(false);
  });
  it('rejette ce qui n\'est pas un nombre', () => {
    expect(parseLocaleNumber('abc').value).toBeNull();
    expect(parseLocaleNumber('12,').value).toBeNull();
  });
  it('formate selon la langue', () => {
    const v = parseLocaleNumber('1234567.891').value!;
    expect(formatDec(v, 'fr')).toBe('1 234 567,89');
    expect(formatDec(v, 'en')).toBe('1,234,567.89');
  });
});

describe('vérification des calculs écrits dans le texte', () => {
  it('valide un calcul juste et corrige un calcul faux', () => {
    const [ok] = verifyInlineCalculations('Budget : 3 x 1500 = 4500 GNF.');
    expect(ok.ok).toBe(true);
    const [ko] = verifyInlineCalculations('Total 3 × 1 500 = 4 000.');
    expect(ko.ok).toBe(false);
    expect(ko.computed).toBe('4500');
    expect(ko.message).toContain('4 500');
  });
  it('accepte un arrondi correct à la précision écrite', () => {
    expect(verifyInlineCalculations('10 / 3 = 3,33')[0].ok).toBe(true);
    expect(verifyInlineCalculations('10 / 3 = 3,34')[0].ok).toBe(false);
  });
  it('ignore les nombres sans égalité', () => {
    expect(verifyInlineCalculations('Réunion le 12, salle 3')).toEqual([]);
  });
});

describe('tableau partagé calculé par le logiciel', () => {
  const table = {
    title: 'Devis',
    columns: [
      { id: 'c1', name: 'Article', type: 'text' as const },
      { id: 'c2', name: 'Quantité', type: 'number' as const },
      { id: 'c3', name: 'Prix', type: 'number' as const },
      { id: 'c4', name: 'Montant', type: 'computed' as const, formula: '{Quantité} * {Prix}' },
    ],
    rows: [
      { id: 'r1', cells: { Article: 'Ciment', Quantité: '3', Prix: '1 500' }, authorId: 'a', updatedAt: 0 },
      { id: 'r2', cells: { Article: 'Sable', Quantité: '2', Prix: '750,50' }, authorId: 'a', updatedAt: 0 },
    ],
  };
  it('calcule chaque ligne et les totaux exactement', () => {
    const c = computeTable(table);
    expect(c.rows[0].computed.Montant).toBe('4500');
    expect(c.rows[1].computed.Montant).toBe('1501');
    expect(c.totals.Montant).toBe('6001');
    expect(c.totals.Quantité).toBe('5');
    expect(c.issues).toEqual([]);
  });
  it('ne totalise pas une colonne marquée sans total (prix unitaire)', () => {
    const t = { ...table, columns: table.columns.map(c => c.name === 'Prix' ? { ...c, sum: false } : c) };
    const c = computeTable(t);
    expect(c.totals.Prix).toBeNull();
    expect(c.totals.Montant).toBe('6001');
  });
  it('signale une valeur annoncée qui contredit le calcul', () => {
    const t = { ...table, rows: [{ ...table.rows[0], cells: { ...table.rows[0].cells, Montant: '4000' } }] };
    const c = computeTable(t);
    expect(c.issues.join(' ')).toContain('valeur annoncée « 4000 »');
  });
  it('exclut une cellule illisible du total et le dit', () => {
    const t = { ...table, rows: [...table.rows, { id: 'r3', cells: { Article: 'Fer', Quantité: 'trois', Prix: '10' }, authorId: 'a', updatedAt: 0 }] };
    const c = computeTable(t);
    expect(c.totals.Montant).toBe('6001');
    expect(c.issues.some(i => i.includes('partiel'))).toBe(true);
  });
  it('valide la définition des colonnes', () => {
    expect(validateColumns([{ name: 'A', type: 'number' }, { name: 'B', type: 'computed', formula: '{A} * {Z}' }])).toContain('inconnue');
    expect(validateColumns([{ name: 'A', type: 'text' }, { name: 'B', type: 'computed', formula: '{A} * 2' }])).toContain('texte');
    expect(validateColumns([{ name: 'A', type: 'number' }, { name: 'a', type: 'number' }])).toContain('même nom');
    expect(validateColumns([{ name: 'A', type: 'number' }, { name: 'B', type: 'computed', formula: '{A} * 2' }])).toBeNull();
  });
  it('formule avec valeur négative', () => {
    expect(toCanonical(evaluateFormula('3 * {A}', { A: '-5' }).value!)).toBe('-15');
  });
});
