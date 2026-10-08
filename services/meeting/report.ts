// Génération du compte-rendu à partir de l'état réel de la réunion.
// Les titres suivent la langue de la personne qui propose le compte-rendu ;
// le contenu reste tel qu'il a été écrit et validé.

import { computeTable } from './workspace';
import { formatDec, parseLocaleNumber } from './calc';
import { MeetingState, WorkspaceItem } from './types';
import { LangCode, languageLabel } from './languages';
import { EXPERT_ROLE_LABELS } from './types';

type Labels = {
  title: string; date: string; mode: string; audio: string; video: string; participants: string; experts: string;
  notes: string; notesOn: string; notesOff: string; recap: string; decisions: string; actions: string; table: string;
  total: string; uncertain: string; none: string; owner: string; due: string; aiPending: string; listening: string;
};

const LABELS: Partial<Record<LangCode, Labels>> = {
  fr: {
    title: 'Compte-rendu', date: 'Date', mode: 'Type d\'appel', audio: 'audio', video: 'vidéo', participants: 'Participants',
    experts: 'Experts IA MokNet', notes: 'Prise de notes', notesOn: 'acceptée par tous les participants', notesOff: 'non activée — aucune transcription conservée',
    recap: 'Récapitulatif', decisions: 'Décisions', actions: "Plan d'action", table: 'Tableau', total: 'Total',
    uncertain: '⚠️ Points incertains à vérifier', none: '(aucun)', owner: 'responsable', due: 'échéance',
    aiPending: 'proposé par un expert IA, non confirmé', listening: 'écoute en',
  },
  en: {
    title: 'Meeting report', date: 'Date', mode: 'Call type', audio: 'audio', video: 'video', participants: 'Participants',
    experts: 'MokNet AI experts', notes: 'Note-taking', notesOn: 'accepted by every participant', notesOff: 'not enabled — no transcript kept',
    recap: 'Summary', decisions: 'Decisions', actions: 'Action plan', table: 'Table', total: 'Total',
    uncertain: '⚠️ Uncertain points to check', none: '(none)', owner: 'owner', due: 'due',
    aiPending: 'proposed by an AI expert, not confirmed', listening: 'listening in',
  },
  es: {
    title: 'Acta de la reunión', date: 'Fecha', mode: 'Tipo de llamada', audio: 'audio', video: 'vídeo', participants: 'Participantes',
    experts: 'Expertos IA de MokNet', notes: 'Toma de notas', notesOn: 'aceptada por todos los participantes', notesOff: 'no activada — no se conserva ninguna transcripción',
    recap: 'Resumen', decisions: 'Decisiones', actions: 'Plan de acción', table: 'Tabla', total: 'Total',
    uncertain: '⚠️ Puntos inciertos por verificar', none: '(ninguno)', owner: 'responsable', due: 'plazo',
    aiPending: 'propuesto por un experto IA, sin confirmar', listening: 'escucha en',
  },
};

export const reportLabels = (lang: LangCode): Labels => LABELS[lang] ?? LABELS.fr!;

/** Somme de contrôle FNV-1a : détecte toute modification du texte validé. */
export const checksum = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

const itemLine = (it: WorkspaceItem, L: Labels, lang: LangCode) => {
  const extra = [it.owner ? `${L.owner} : ${it.owner}` : '', it.due ? `${L.due} : ${it.due}` : ''].filter(Boolean).join(', ');
  const flag = it.uncertain ? ' ⚠️' : '';
  const tr = it.lang !== lang ? it.translations[lang] : undefined;
  const translated = tr?.status === 'ok' && tr.text ? `\n  ↳ (${lang}) ${tr.text}` : '';
  return `- ${it.text}${extra ? ` (${extra})` : ''}${flag}${translated}`;
};

export const buildReportText = (state: MeetingState, lang: LangCode, now: number): string => {
  const L = reportLabels(lang);
  const humans = state.participants.filter(p => p.kind === 'human' && (p.status === 'joined' || p.status === 'left'));
  const experts = state.participants.filter(p => p.kind === 'expert' && p.status !== 'invited');
  const sec = (s: WorkspaceItem['section']) => state.workspace.items.filter(i => i.section === s);
  const lines: string[] = [];
  lines.push(`# ${L.title} — ${state.title}`);
  lines.push(`${L.date} : ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  lines.push(`${L.mode} : ${state.mode === 'video' ? L.video : L.audio}`);
  lines.push('');
  lines.push(`## ${L.participants}`);
  humans.forEach(p => lines.push(`- ${p.name} (${L.listening} ${languageLabel(p.listenLang)})`));
  if (experts.length) {
    lines.push('');
    lines.push(`## ${L.experts}`);
    experts.forEach(p => lines.push(`- ${p.name} — ${p.expertRole ? EXPERT_ROLE_LABELS[p.expertRole] : ''}`));
  }
  lines.push('');
  lines.push(`${L.notes} : ${state.noteTaking.status === 'active' ? L.notesOn : L.notesOff}`);

  for (const [key, title] of [['recap', L.recap], ['decisions', L.decisions], ['actions', L.actions]] as const) {
    lines.push('');
    lines.push(`## ${title}`);
    const items = sec(key);
    if (!items.length) lines.push(L.none);
    items.forEach(it => lines.push(itemLine(it, L, lang)));
  }

  const table = state.workspace.table;
  if (table.columns.length && table.rows.length) {
    const computed = computeTable(table);
    lines.push('');
    lines.push(`## ${L.table} — ${table.title}`);
    lines.push(`| ${table.columns.map(c => c.name).join(' | ')} |`);
    lines.push(`|${table.columns.map(() => '---').join('|')}|`);
    table.rows.forEach((r, i) => {
      const cr = computed.rows[i];
      const cells = table.columns.map(c => {
        if (c.type === 'text') return r.cells[c.name] ?? '';
        const v = cr.computed[c.name];
        return v === null || v === undefined ? (r.cells[c.name] ?? '') : formatDec(parseLocaleNumber(v).value!, lang);
      });
      lines.push(`| ${cells.join(' | ')} |`);
    });
    const totals = table.columns.map((c, idx) => {
      if (c.type === 'text') return idx === 0 ? `**${L.total}**` : '';
      const v = computed.totals[c.name];
      return v === null || v === undefined ? '—' : `**${formatDec(parseLocaleNumber(v).value!, lang)}**`;
    });
    lines.push(`| ${totals.join(' | ')} |`);
    computed.issues.forEach(i => lines.push(`> ⚠️ ${i}`));
  }

  const uncertainItems = state.workspace.items.filter(i => i.uncertain);
  const tableIssues = table.rows.length ? computeTable(table).issues : [];
  lines.push('');
  lines.push(`## ${L.uncertain}`);
  if (!uncertainItems.length && !tableIssues.length) lines.push(L.none);
  uncertainItems.forEach(it => lines.push(`- « ${it.text} » — ${it.reasons.join(' ; ')}`));
  tableIssues.forEach(i => lines.push(`- ${i}`));
  return lines.join('\n');
};
