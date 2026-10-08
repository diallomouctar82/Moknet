// Espace partagé de la réunion : tableau calculé par le logiciel, récap,
// décisions et plan d'action.

import { evaluateFormula, parseLocaleNumber, dec, toCanonical, Dec, formatDec, matchesClaim } from './calc';
import { assessText } from './uncertainty';
import { ComputedTable, SharedTable, TableColumn, WorkspaceItem, WorkspaceSection } from './types';

export const MAX_TEXT_LENGTH = 2000;   // borne aussi le coût de l'analyse des calculs
export const MAX_CELL_LENGTH = 200;

export const emptyWorkspace = () => ({
  items: [] as WorkspaceItem[],
  table: { title: 'Tableau', columns: [] as TableColumn[], rows: [] } as SharedTable,
  dismissed: [] as string[],
});

export const dedupKey = (section: WorkspaceSection, text: string) => `${section}|${normalizeForDedup(text)}`;

/** (Re)calcule l'état d'incertitude d'un élément à partir de son texte. */
export const assessItem = (item: WorkspaceItem): WorkspaceItem => {
  const a = assessText([item.text, item.owner, item.due].filter(Boolean).join(' — '), {
    aiGenerated: item.aiGenerated && item.confirmedBy.length === 0,
  });
  return { ...item, uncertain: a.uncertain, reasons: a.reasons, calcChecks: a.calcChecks };
};

export const normalizeForDedup = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const sectionLabel: Record<WorkspaceSection, string> = {
  recap: 'Récapitulatif',
  decisions: 'Décisions',
  actions: "Plan d'action",
};

/** Vérifie qu'une formule ne référence que des colonnes chiffrées existantes. */
export const validateColumns = (columns: Array<Omit<TableColumn, 'id'>>): string | null => {
  const names = columns.map(c => c.name.trim());
  if (names.some(n => !n)) return 'Chaque colonne doit avoir un nom';
  if (new Set(names.map(n => n.toLowerCase())).size !== names.length) return 'Deux colonnes portent le même nom';
  for (const [idx, c] of columns.entries()) {
    if (c.type !== 'computed') continue;
    if (!c.formula) return `La colonne calculée « ${c.name} » n'a pas de formule`;
    const refs = Array.from(c.formula.matchAll(/\{([^}]+)\}/g)).map(m => m[1].trim());
    if (!refs.length) return `La formule de « ${c.name} » ne référence aucune colonne`;
    for (const r of refs) {
      const col = columns.find(x => x.name.trim() === r);
      if (!col) return `La formule de « ${c.name} » référence une colonne inconnue « ${r} »`;
      if (col.type === 'text') return `La formule de « ${c.name} » utilise la colonne texte « ${r} »`;
      if (col.name.trim() === c.name.trim()) return `La formule de « ${c.name} » se référence elle-même`;
      if (columns.indexOf(col) > idx) return `La formule de « ${c.name} » doit utiliser des colonnes placées avant elle (« ${r} » est après)`;
    }
  }
  return null;
};

/**
 * Calcule toutes les cellules dérivées et les totaux. Aucune valeur calculée
 * n'est saisie par un humain ou une IA : tout passe par calc.ts.
 */
export const computeTable = (table: SharedTable): ComputedTable => {
  const numeric = table.columns.filter(c => c.type !== 'text');
  const sums: Record<string, Dec> = {};
  const invalidCount: Record<string, number> = {};
  numeric.forEach(c => { sums[c.name] = dec.zero(); invalidCount[c.name] = 0; });
  const issues: string[] = [];

  // Colonnes calculées dans l'ordre : une formule peut utiliser une autre colonne calculée définie avant.
  const rows = table.rows.map((row, idx) => {
    const values: Record<string, string> = { ...row.cells };
    const computed: Record<string, string | null> = {};
    const rowIssues: string[] = [];
    for (const col of table.columns) {
      if (col.type === 'number') {
        const raw = row.cells[col.name] ?? '';
        if (!raw.trim()) { computed[col.name] = null; continue; }
        const p = parseLocaleNumber(raw);
        if (!p.value) { rowIssues.push(`Ligne ${idx + 1}, ${col.name} : ${p.reason}`); computed[col.name] = null; invalidCount[col.name]++; continue; }
        if (p.ambiguous && p.reason) rowIssues.push(`Ligne ${idx + 1}, ${col.name} : ${p.reason}`);
        computed[col.name] = toCanonical(p.value);
        values[col.name] = toCanonical(p.value);
        sums[col.name] = dec.add(sums[col.name], p.value);
      } else if (col.type === 'computed') {
        const r = evaluateFormula(col.formula || '', values);
        r.ambiguous.forEach(a => rowIssues.push(`Ligne ${idx + 1}, ${col.name} : ${a}`));
        if (!r.value) {
          computed[col.name] = null;
          invalidCount[col.name]++;
          rowIssues.push(`Ligne ${idx + 1}, ${col.name} : calcul impossible (${r.error})`);
          continue;
        }
        computed[col.name] = toCanonical(r.value);
        values[col.name] = toCanonical(r.value);
        sums[col.name] = dec.add(sums[col.name], r.value);
        // Une valeur saisie à la main dans une colonne calculée est comparée au calcul.
        const claimedRaw = row.cells[col.name];
        if (claimedRaw && claimedRaw.trim()) {
          const claimed = parseLocaleNumber(claimedRaw);
          if (!claimed.value || !matchesClaim(r.value, claimed.value)) {
            rowIssues.push(`Ligne ${idx + 1}, ${col.name} : valeur annoncée « ${claimedRaw} » ≠ calcul ${formatDec(r.value)}`);
          }
        }
      }
    }
    issues.push(...rowIssues);
    return { id: row.id, computed, issues: rowIssues };
  });

  const totals: Record<string, string | null> = {};
  for (const c of numeric) {
    if (c.sum === false) { totals[c.name] = null; continue; }
    totals[c.name] = table.rows.length ? toCanonical(sums[c.name]) : null;
    if (invalidCount[c.name]) issues.push(`Total « ${c.name} » partiel : ${invalidCount[c.name]} cellule(s) illisible(s) exclue(s)`);
  }
  return { rows, totals, issues };
};
