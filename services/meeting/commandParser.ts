// Interprète une phrase dictée ou écrite en commande sur l'espace partagé.
// Fonctionne en français, anglais et espagnol. Une phrase non reconnue renvoie
// null : l'interface demande alors dans quelle section la ranger, sans deviner.

import { WorkspaceSection } from './types';

export type ParsedCommand =
  | { kind: 'add'; section: WorkspaceSection; text: string; owner?: string; due?: string }
  | { kind: 'edit'; section: WorkspaceSection; index: number; text: string }
  | { kind: 'delete'; section: WorkspaceSection; index: number }
  | { kind: 'delete_row'; index: number }
  | { kind: 'row'; values: string[] }
  | { kind: 'cell'; index: number; column: string; value: string };

export interface ParseContext {
  participantNames: string[];
  columnNames: string[];
  /** Strict : le mot-clé doit être suivi de « : » (lecture automatique d'une transcription). */
  strict?: boolean;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const SECTION_WORDS: Array<{ section: WorkspaceSection | 'row'; words: string[] }> = [
  { section: 'decisions', words: ['decision', 'decisions', 'decisiones'] },
  { section: 'actions', words: ['action', 'actions', 'tache', 'taches', 'task', 'tasks', 'tarea', 'tareas', 'accion', 'acciones'] },
  { section: 'recap', words: ['recap', 'resume', 'summary', 'resumen', 'note', 'notes', 'nota'] },
  { section: 'row', words: ['ligne', 'row', 'fila'] },
];

const sectionOf = (word: string) => SECTION_WORDS.find(s => s.words.includes(fold(word)))?.section;

const SEP = String.raw`\s*[:\-–—]?\s*`;
const STRICT_SEP = String.raw`\s*[:\-–—]\s*`;
// Mot-clé entier : « Actionnaires » ou « Notez » ne sont pas des commandes. Formes longues d'abord.
const keyword = (words: string[], strict: boolean) =>
  new RegExp(`^(?:${[...words].sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}])${strict ? STRICT_SEP : SEP}`, 'iu');
// Phrase naturelle : « On a décidé que X » → X ; « On a décidé de X » → la phrase entière.
const NATURAL_DECISION = /^(?:on a decide|nous avons decide|we decided|we agreed|decidimos|acordamos)(\s+(?:que|that))?\s*[:,]?\s*/i;

const PREFIX_WORDS: Array<{ words: string[]; section: WorkspaceSection | 'row' }> = [
  { words: ['decision', 'decisions', 'decisiones'], section: 'decisions' },
  { words: ['action', 'actions', 'tache', 'taches', 'task', 'tasks', 'tarea', 'tareas', 'accion', 'acciones'], section: 'actions' },
  { words: ['recap', 'resume', 'summary', 'resumen', 'note', 'notes', 'nota'], section: 'recap' },
  { words: ['ajouter une ligne', 'ajoute une ligne', 'ajouter ligne', 'ajoute ligne', 'add row', 'ligne', 'row', 'fila'], section: 'row' },
];
const ADD_PREFIXES = {
  lenient: PREFIX_WORDS.map(p => ({ re: keyword(p.words, false), section: p.section })),
  strict: PREFIX_WORDS.map(p => ({ re: keyword(p.words, true), section: p.section })),
};

const EDIT_RE = /^(?:corrige(?:r)?|modifie(?:r)?|remplace(?:r)?|fix|correct|edit|update|corrige|corregir|corrija|cambia(?:r)?)\s+(?:la |le |l'|the )?(\S+)\s+(?:n[°o]\s*|numero\s+|number\s+|#)?(\d+)\s*[:\-–—]?\s*([\s\S]+)$/i;
const DELETE_RE = /^(?:supprime(?:r)?|efface(?:r)?|retire(?:r)?|delete|remove|borra(?:r)?|elimina(?:r)?)\s+(?:la |le |l'|the )?(\S+)\s+(?:n[°o]\s*|numero\s+|number\s+|#)?(\d+)\s*$/i;

// Échéance : "avant vendredi", "d'ici le 15 mars", "by Friday", "antes del viernes".
// Le préfixe gourmand retient le DERNIER mot-clé (« by phone before Friday » → « Friday »).
const DUE_RE = /^(.*\S)\s+(?:avant(?: le)?|d'ici(?: le| a)?|au plus tard(?: le)?|by|before|due|antes de(?:l)?|para el)\s+(\S.*)$/id;

const extractOwnerAndDue = (text: string, ctx: ParseContext) => {
  let rest = text;
  let due: string | undefined;
  const dm = DUE_RE.exec(fold(rest)) as (RegExpExecArray & { indices?: Array<[number, number]> }) | null;
  if (dm?.indices) {
    // le motif est cherché sans accents, mais l'échéance garde le texte original
    due = rest.slice(dm.indices[2][0]).trim();
    rest = rest.slice(0, dm.indices[1][1]).trim();
  }
  let owner: string | undefined;
  const at = /@([\p{L}][\p{L}\-' .]*)$/u.exec(rest);
  const names = [...ctx.participantNames].sort((a, b) => b.length - a.length);
  const findName = (candidate: string) => names.find(n => fold(candidate).startsWith(fold(n)) || fold(n).startsWith(fold(candidate).trim()));
  if (at) {
    owner = findName(at[1]) ?? at[1].trim();
    rest = rest.slice(0, at.index).trim();
  } else {
    const pm = /\s+(?:pour|par|for|para|assigned to|confiee? a)\s+(.+)$/i.exec(rest);
    if (pm) {
      const n = findName(pm[1]);
      if (n) { owner = n; rest = rest.slice(0, pm.index).trim(); }
    }
    if (!owner) {
      // "Aminata envoie le devis" : le responsable est cité en tête de phrase.
      const n = names.find(nm => fold(rest).startsWith(fold(nm.split(' ')[0]) + ' '));
      if (n) owner = n;
    }
  }
  return { text: rest.replace(/[.;,]\s*$/, '').trim(), owner, due: due?.replace(/[.;]\s*$/, '') };
};

const splitRow = (s: string) => s.split(/\s*[;|]\s*|,\s+/).map(v => v.trim()).filter(v => v.length);

export const parseWorkspaceCommand = (input: string, ctx: ParseContext): ParsedCommand | null => {
  const raw = input.trim();
  if (!raw) return null;
  const folded = fold(raw);

  const del = DELETE_RE.exec(folded);
  if (del) {
    const sec = sectionOf(del[1]);
    const index = parseInt(del[2], 10);
    if (sec === 'row') return { kind: 'delete_row', index };
    if (sec) return { kind: 'delete', section: sec, index };
  }

  const ed = EDIT_RE.exec(folded);
  if (ed) {
    const sec = sectionOf(ed[1]);
    const index = parseInt(ed[2], 10);
    const tail = raw.slice(raw.length - ed[3].length).trim();
    if (sec === 'row') {
      const cols = [...ctx.columnNames].sort((a, b) => b.length - a.length);
      const col = cols.find(c => fold(tail).startsWith(fold(c)));
      if (col) {
        const value = tail.slice(col.length).replace(/^\s*[:=\-–—]?\s*/, '').trim();
        if (value) return { kind: 'cell', index, column: col, value };
      }
      return null;
    }
    if (sec) return { kind: 'edit', section: sec, index, text: tail };
  }

  const nat = NATURAL_DECISION.exec(folded);
  if (nat) {
    const body = nat[1] ? raw.slice(nat[0].length).trim() : raw;
    if (body) return { kind: 'add', section: 'decisions', text: body.replace(/[.;]\s*$/, '') };
  }

  for (const p of ctx.strict ? ADD_PREFIXES.strict : ADD_PREFIXES.lenient) {
    const m = p.re.exec(folded);
    if (!m) continue;
    const body = raw.slice(m[0].length).trim();
    if (!body) return null;
    if (p.section === 'row') return { kind: 'row', values: splitRow(body) };
    if (p.section === 'actions') {
      const { text, owner, due } = extractOwnerAndDue(body, ctx);
      return { kind: 'add', section: 'actions', text, owner, due };
    }
    return { kind: 'add', section: p.section, text: body.replace(/^que\s+/i, '') };
  }
  return null;
};
