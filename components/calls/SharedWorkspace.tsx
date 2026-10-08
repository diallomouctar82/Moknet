import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bot, Check, CheckCircle2, Mic, MicOff, PenLine, Send, Table2, Trash2, XCircle, FileCheck2, Plus } from 'lucide-react';
import { MeetingIntent, MeetingState, WorkspaceItem, WorkspaceSection, ColumnType, TableColumn } from '../../services/meeting/types';
import { computeTable } from '../../services/meeting/workspace';
import { formatDec, parseLocaleNumber } from '../../services/meeting/calc';
import { parseWorkspaceCommand } from '../../services/meeting/commandParser';
import { dictationLocale, LangCode } from '../../services/meeting/languages';
import { joinedHumans } from '../../services/meeting/meetingCore';
import { useDictation } from './useDictation';

type Tab = 'table' | WorkspaceSection | 'report';

interface Props {
  meeting: MeetingState;
  meId: string;
  dispatch: (intent: MeetingIntent) => Promise<unknown>;
}

const TAB_LABELS: Record<Tab, string> = { table: 'Tableau', recap: 'Récap', decisions: 'Décisions', actions: "Plan d'action", report: 'Compte-rendu' };

const fmt = (canon: string | null | undefined, lang: LangCode) => {
  if (canon === null || canon === undefined) return '—';
  const v = parseLocaleNumber(canon).value;
  return v ? formatDec(v, lang) : canon;
};

export const SharedWorkspace: React.FC<Props> = ({ meeting, meId, dispatch }) => {
  const me = meeting.participants.find(p => p.id === meId)!;
  const [tab, setTab] = useState<Tab>('decisions');
  const [command, setCommand] = useState('');
  const [via, setVia] = useState<'text' | 'voice'>('text');
  const [unsorted, setUnsorted] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dictation = useDictation(dictationLocale(me.speakLang), (t) => { setCommand(t); setVia('voice'); });
  const table = useMemo(() => computeTable(meeting.workspace.table), [meeting.workspace.table]);
  const items = (s: WorkspaceSection) => meeting.workspace.items.filter(i => i.section === s);

  const run = async (intent: MeetingIntent, ok?: string) => {
    try { await dispatch(intent); if (ok) setNotice(ok); } catch (e) { setNotice(`⚠️ ${(e as Error).message}`); }
  };

  const submitCommand = async () => {
    const text = command.trim();
    if (!text) return;
    const parsed = parseWorkspaceCommand(text, {
      participantNames: joinedHumans(meeting).map(p => p.name),
      columnNames: meeting.workspace.table.columns.map(c => c.name),
    });
    setCommand('');
    const source = via;
    setVia('text');
    if (!parsed) { setUnsorted(text); return; }
    switch (parsed.kind) {
      case 'add':
        setTab(parsed.section);
        return run({ type: 'WS_ADD_ITEM', by: meId, section: parsed.section, text: parsed.text, owner: parsed.owner, due: parsed.due, via: source });
      case 'edit': {
        const target = items(parsed.section)[parsed.index - 1];
        if (!target) return setNotice(`⚠️ Aucun élément n°${parsed.index} dans ${TAB_LABELS[parsed.section]}`);
        setTab(parsed.section);
        return run({ type: 'WS_EDIT_ITEM', by: meId, itemId: target.id, text: parsed.text, via: source });
      }
      case 'delete': {
        const target = items(parsed.section)[parsed.index - 1];
        if (!target) return setNotice(`⚠️ Aucun élément n°${parsed.index} dans ${TAB_LABELS[parsed.section]}`);
        return run({ type: 'WS_DELETE_ITEM', by: meId, itemId: target.id });
      }
      case 'row': {
        const cols = meeting.workspace.table.columns.filter(c => c.type !== 'computed');
        if (!cols.length) return setNotice('⚠️ Créez d\'abord le tableau (onglet Tableau).');
        const cells = Object.fromEntries(cols.map((c, i) => [c.name, parsed.values[i] ?? '']));
        setTab('table');
        return run({ type: 'WS_TABLE_ADD_ROW', by: meId, cells });
      }
      case 'cell': {
        const row = meeting.workspace.table.rows[parsed.index - 1];
        if (!row) return setNotice(`⚠️ Aucune ligne n°${parsed.index}`);
        setTab('table');
        return run({ type: 'WS_TABLE_EDIT_CELL', by: meId, rowId: row.id, column: parsed.column, value: parsed.value });
      }
      case 'delete_row': {
        const row = meeting.workspace.table.rows[parsed.index - 1];
        if (!row) return setNotice(`⚠️ Aucune ligne n°${parsed.index}`);
        return run({ type: 'WS_TABLE_DELETE_ROW', by: meId, rowId: row.id });
      }
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col" aria-label="Espace partagé">
      <header className="px-4 pt-4">
        <h3 className="font-bold text-slate-900 text-sm">Espace partagé</h3>
        <p className="text-[11px] text-slate-500">Visible et modifiable par tous les participants, à la voix ou à l'écrit. Les calculs sont faits par le logiciel ; ⚠️ = information incertaine.</p>
        <nav className="flex flex-wrap gap-1 mt-3" role="tablist">
          {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} data-testid={`ws-tab-${t}`} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${tab === t ? 'bg-brand-dark text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {TAB_LABELS[t]}
              {t !== 'table' && t !== 'report' && items(t).length > 0 && <span className="ml-1 opacity-70">{items(t).length}</span>}
              {t === 'report' && meeting.report && <span className="ml-1">{meeting.report.status === 'validated' ? '✅' : '•'}</span>}
            </button>
          ))}
        </nav>
      </header>

      {tab !== 'report' && (
        <div className="px-4 pt-3">
          <div className="flex gap-2">
            <input
              data-testid="ws-command"
              value={command}
              onChange={e => { setCommand(e.target.value); setVia('text'); }}
              onKeyDown={e => e.key === 'Enter' && submitCommand()}
              placeholder="« Décision : … », « Action : … pour Aminata avant vendredi », « Ligne : Ciment ; 3 ; 1500 »"
              className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-brand-gold"
              aria-label="Commande de l'espace partagé"
            />
            <button onClick={dictation.toggle} disabled={!dictation.available}
              title={dictation.available ? 'Dicter' : 'Dictée indisponible dans votre langue ou ce navigateur'}
              className={`p-2 rounded-xl ${dictation.listening ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'} disabled:opacity-40`} aria-label="Dicter">
              {dictation.listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button data-testid="ws-command-send" onClick={submitCommand} className="p-2 rounded-xl bg-brand-dark text-white" aria-label="Envoyer"><Send size={18} /></button>
          </div>
          {dictation.error && <p className="text-[11px] text-amber-700 mt-1">{dictation.error}</p>}
          {unsorted && (
            <div className="mt-2 p-2 rounded-xl bg-blue-50 border border-blue-100 text-xs flex flex-wrap items-center gap-2" data-testid="ws-unsorted">
              <span className="text-blue-900">Où ranger « {unsorted} » ?</span>
              {(['recap', 'decisions', 'actions'] as WorkspaceSection[]).map(s => (
                <button key={s} className="px-2 py-1 rounded-lg bg-white border border-blue-200 font-bold text-blue-700"
                  onClick={() => { void run({ type: 'WS_ADD_ITEM', by: meId, section: s, text: unsorted }); setUnsorted(null); setTab(s); }}>
                  {TAB_LABELS[s]}
                </button>
              ))}
              <button className="text-slate-500 underline" onClick={() => setUnsorted(null)}>Annuler</button>
            </div>
          )}
          {notice && <p className="text-[11px] text-slate-600 mt-1" role="status">{notice}</p>}
        </div>
      )}

      <div className="p-4 overflow-y-auto">
        {tab === 'table' && <TableView meeting={meeting} meId={meId} lang={me.listenLang} computed={table} run={run} />}
        {(tab === 'recap' || tab === 'decisions' || tab === 'actions') && (
          <ul className="space-y-2">
            {items(tab).length === 0 && <li className="text-xs text-slate-400 italic">Rien pour l'instant.</li>}
            {items(tab).map((it, i) => <ItemCard key={it.id} item={it} index={i + 1} meId={meId} lang={me.listenLang} run={run} />)}
          </ul>
        )}
        {tab === 'report' && <ReportView meeting={meeting} meId={meId} run={run} />}
      </div>
    </section>
  );
};

const ItemCard: React.FC<{ item: WorkspaceItem; index: number; meId: string; lang: LangCode; run: (i: MeetingIntent, ok?: string) => Promise<void> }> = ({ item, index, meId, lang, run }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [showOriginal, setShowOriginal] = useState(false);
  const tr = item.lang !== lang ? item.translations[lang] : undefined;
  const display = tr?.status === 'ok' && tr.text && !showOriginal ? tr.text : item.text;
  const aiPending = item.aiGenerated && item.confirmedBy.length === 0;
  return (
    <li data-testid="ws-item" data-section={item.section} data-uncertain={item.uncertain ? 'true' : 'false'}
      className={`p-3 rounded-xl border text-sm ${item.uncertain ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      {editing ? (
        <div className="flex gap-2">
          <input value={draft} onChange={e => setDraft(e.target.value)} className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-slate-300 text-sm" aria-label="Modifier l'élément" />
          <button className="px-2 rounded-lg bg-emerald-600 text-white text-xs font-bold" onClick={() => { void run({ type: 'WS_EDIT_ITEM', by: meId, itemId: item.id, text: draft }); setEditing(false); }}>OK</button>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <span className="text-[11px] font-bold text-slate-400 mt-0.5">{index}.</span>
          <div className="flex-1 min-w-0">
            <p className="text-slate-800 break-words" data-testid="ws-item-text">{item.uncertain && <AlertTriangle size={14} className="inline text-amber-600 mr-1 -mt-0.5" aria-label="incertain" />}{display}</p>
            {tr && (
              <button className="text-[10px] text-blue-600 underline" onClick={() => setShowOriginal(!showOriginal)}>
                {tr.status === 'pending' ? 'traduction en cours…' : tr.status === 'failed' ? 'traduction indisponible — texte original' : showOriginal ? 'voir la traduction' : `voir l'original (${item.lang})`}
                {tr.experimental && tr.status === 'ok' ? ' · traduction expérimentale' : ''}
              </button>
            )}
            {(item.owner || item.due) && (
              <p className="text-xs text-slate-600 mt-1">{item.owner && <>👤 {item.owner} </>}{item.due && <>📅 {item.due}</>}</p>
            )}
            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 flex-wrap">
              {item.via === 'expert' ? <Bot size={10} /> : item.via === 'voice' ? <Mic size={10} /> : <PenLine size={10} />}
              {item.authorName}{item.history.length > 0 && ` · modifié ${item.history.length}×`}{item.confirmedBy.length > 0 && ` · confirmé par ${item.confirmedBy.length}`}
            </p>
            {item.calcChecks.map((c, i) => (
              <p key={i} className={`text-[11px] mt-1 flex items-center gap-1 ${c.ok ? 'text-emerald-700' : c.status === 'approx' ? 'text-amber-700' : 'text-red-700'}`} data-testid="calc-check" data-ok={c.ok ? 'true' : 'false'} data-status={c.status}>
                {c.ok ? <CheckCircle2 size={12} /> : c.status === 'approx' ? <AlertTriangle size={12} /> : <XCircle size={12} />} {c.message}
              </p>
            ))}
            {item.uncertain && (
              <ul className="text-[11px] text-amber-800 mt-1 list-disc pl-4" data-testid="uncertainty-reasons">
                {item.reasons.filter(r => !r.startsWith('Calcul')).map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {aiPending && (
              <button data-testid="ws-confirm" title="Confirmer (vérifié par un participant)" onClick={() => run({ type: 'WS_CONFIRM_ITEM', by: meId, itemId: item.id })} className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-700" aria-label="Confirmer"><Check size={14} /></button>
            )}
            <button title="Modifier" onClick={() => { setDraft(item.text); setEditing(true); }} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Modifier"><PenLine size={14} /></button>
            <button title="Supprimer" onClick={() => run({ type: 'WS_DELETE_ITEM', by: meId, itemId: item.id })} className="p-1 rounded-lg hover:bg-red-50 text-red-500" aria-label="Supprimer"><Trash2 size={14} /></button>
          </div>
        </div>
      )}
    </li>
  );
};

const PRESETS: Record<string, { title: string; columns: Array<Omit<TableColumn, 'id'>> }> = {
  quote: { title: 'Devis', columns: [
    { name: 'Article', type: 'text' }, { name: 'Quantité', type: 'number' }, { name: 'Prix unitaire', type: 'number', sum: false },
    { name: 'Montant', type: 'computed', formula: '{Quantité} * {Prix unitaire}' },
  ] },
  budget: { title: 'Budget', columns: [{ name: 'Poste', type: 'text' }, { name: 'Montant', type: 'number' }] },
};

const TableView: React.FC<{ meeting: MeetingState; meId: string; lang: LangCode; computed: ReturnType<typeof computeTable>; run: (i: MeetingIntent, ok?: string) => Promise<void> }> = ({ meeting, meId, lang, computed, run }) => {
  const t = meeting.workspace.table;
  const [draftRow, setDraftRow] = useState<Record<string, string>>({});
  const [builder, setBuilder] = useState<Array<Omit<TableColumn, 'id'>>>([{ name: '', type: 'text' }]);

  if (!t.columns.length) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-slate-500 flex items-center gap-1"><Table2 size={14} /> Aucun tableau. Choisissez un modèle ou définissez vos colonnes.</p>
        <div className="flex gap-2 flex-wrap">
          <button data-testid="table-preset-quote" onClick={() => run({ type: 'WS_TABLE_SETUP', by: meId, ...PRESETS.quote })} className="px-3 py-1.5 rounded-lg bg-brand-dark text-white text-xs font-bold">Devis (quantité × prix)</button>
          <button onClick={() => run({ type: 'WS_TABLE_SETUP', by: meId, ...PRESETS.budget })} className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-xs font-bold">Budget</button>
        </div>
        <div className="border border-slate-200 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-slate-600">Colonnes personnalisées</p>
          {builder.map((c, i) => (
            <div key={i} className="flex gap-2 flex-wrap">
              <input value={c.name} onChange={e => setBuilder(b => b.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Nom" className="flex-1 min-w-[100px] px-2 py-1 rounded-lg border text-xs" />
              <select value={c.type} onChange={e => setBuilder(b => b.map((x, j) => j === i ? { ...x, type: e.target.value as ColumnType } : x))} className="px-2 py-1 rounded-lg border text-xs bg-white">
                <option value="text">Texte</option><option value="number">Nombre</option><option value="computed">Calculée</option>
              </select>
              {c.type === 'computed' && <input value={c.formula ?? ''} onChange={e => setBuilder(b => b.map((x, j) => j === i ? { ...x, formula: e.target.value } : x))} placeholder="{Quantité} * {Prix}" className="flex-1 min-w-[120px] px-2 py-1 rounded-lg border text-xs font-mono" />}
              {c.type !== 'text' && (
                <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={c.sum !== false} onChange={e => setBuilder(b => b.map((x, j) => j === i ? { ...x, sum: e.target.checked } : x))} /> Totaliser</label>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setBuilder(b => [...b, { name: '', type: 'number' }])} className="text-xs text-blue-700 font-bold flex items-center gap-1"><Plus size={12} /> Colonne</button>
            <button onClick={() => run({ type: 'WS_TABLE_SETUP', by: meId, title: 'Tableau', columns: builder })} className="ml-auto px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold">Créer</button>
          </div>
        </div>
      </div>
    );
  }

  const inputCols = t.columns.filter(c => c.type !== 'computed');
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-700">{t.title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" data-testid="shared-table">
          <thead>
            <tr>{t.columns.map(c => <th key={c.id} className="text-left p-2 bg-slate-100 border-b border-slate-200 whitespace-nowrap">{c.name}{c.type === 'computed' && <span className="ml-1 text-[9px] text-slate-500 font-normal">(calculé)</span>}</th>)}<th className="bg-slate-100 border-b border-slate-200" /></tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={r.id} className="border-b border-slate-100">
                {t.columns.map(c => c.type === 'computed' ? (
                  <td key={c.id} className="p-2 bg-emerald-50 font-mono text-right" data-testid={`cell-${i + 1}-${c.name}`}>{fmt(computed.rows[i]?.computed[c.name], lang)}</td>
                ) : (
                  <td key={c.id} className="p-1">
                    <input defaultValue={r.cells[c.name] ?? ''} key={`${r.id}-${c.name}-${r.updatedAt}`} aria-label={`${c.name} ligne ${i + 1}`}
                      onBlur={e => { if (e.target.value !== (r.cells[c.name] ?? '')) void run({ type: 'WS_TABLE_EDIT_CELL', by: meId, rowId: r.id, column: c.name, value: e.target.value }); }}
                      className={`w-full min-w-[60px] px-1 py-1 rounded border border-transparent hover:border-slate-200 focus:border-brand-gold outline-none ${c.type === 'number' ? 'text-right font-mono' : ''}`} />
                  </td>
                ))}
                <td className="p-1"><button onClick={() => run({ type: 'WS_TABLE_DELETE_ROW', by: meId, rowId: r.id })} className="text-red-400 hover:text-red-600" aria-label={`Supprimer la ligne ${i + 1}`}><Trash2 size={12} /></button></td>
              </tr>
            ))}
            <tr className="font-bold bg-slate-50">
              {t.columns.map((c, idx) => (
                <td key={c.id} className={`p-2 ${c.type !== 'text' ? 'text-right font-mono' : ''}`} data-testid={c.type !== 'text' ? `table-total-${c.name}` : undefined}>
                  {c.type === 'text' ? (idx === 0 ? 'Total' : '') : fmt(computed.totals[c.name], lang)}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {computed.issues.length > 0 && (
        <ul className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 list-disc pl-5" data-testid="table-issues">
          {computed.issues.map((i, k) => <li key={k}>{i}</li>)}
        </ul>
      )}
      <div className="flex gap-2 flex-wrap items-center">
        {inputCols.map(c => (
          <input key={c.id} data-testid={`row-input-${c.name}`} placeholder={c.name} value={draftRow[c.name] ?? ''}
            onChange={e => setDraftRow(d => ({ ...d, [c.name]: e.target.value }))}
            className={`flex-1 min-w-[80px] px-2 py-1.5 rounded-lg border border-slate-200 text-xs ${c.type === 'number' ? 'font-mono' : ''}`} />
        ))}
        <button data-testid="row-add" onClick={() => { void run({ type: 'WS_TABLE_ADD_ROW', by: meId, cells: draftRow }); setDraftRow({}); }} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">Ajouter</button>
      </div>
    </div>
  );
};

const ReportView: React.FC<{ meeting: MeetingState; meId: string; run: (i: MeetingIntent, ok?: string) => Promise<void> }> = ({ meeting, meId, run }) => {
  const r = meeting.report;
  const [comment, setComment] = useState('');
  const nameOf = (id: string) => meeting.participants.find(p => p.id === id)?.name ?? id;
  const uncertainCount = meeting.workspace.items.filter(i => i.uncertain).length;
  const canPropose = !r || r.status === 'changes_requested';
  return (
    <div className="space-y-3" data-testid="report-panel">
      {canPropose && (
        <div className="space-y-2">
          <p className="text-xs text-slate-600">Le compte-rendu reprend l'espace partagé. Il devra être validé par chaque participant présent ; il restera dans la conversation, visible uniquement par eux.</p>
          {uncertainCount > 0 && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">⚠️ {uncertainCount} information(s) incertaine(s) : elles seront signalées dans le compte-rendu.</p>}
          {r?.comments.map((c, i) => <p key={i} className="text-xs text-slate-700">💬 {c.by} : {c.text}</p>)}
          <button data-testid="report-propose" onClick={() => run({ type: 'REPORT_PROPOSE', by: meId })} className="px-4 py-2 rounded-xl bg-brand-dark text-white text-sm font-bold flex items-center gap-2"><FileCheck2 size={16} /> Proposer le compte-rendu</button>
        </div>
      )}
      {r && (
        <>
          <div className="flex flex-wrap gap-2 text-xs" data-testid="report-status" data-status={r.status}>
            {Object.entries(r.approvals).map(([id, a]) => (
              <span key={id} className={`px-2 py-1 rounded-full font-bold ${a === 'approved' ? 'bg-emerald-100 text-emerald-800' : a === 'changes_requested' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}`}>
                {nameOf(id)} : {a === 'approved' ? 'validé' : a === 'changes_requested' ? 'correction demandée' : 'en attente'}
              </span>
            ))}
          </div>
          <pre data-testid="report-text" className="whitespace-pre-wrap text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-80 overflow-y-auto font-sans">{r.text}</pre>
          {r.status === 'pending_approval' && r.approvals[meId] === 'pending' && (
            <div className="flex flex-col sm:flex-row gap-2">
              <button data-testid="report-approve" onClick={() => run({ type: 'REPORT_APPROVE', userId: meId })} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">Je valide</button>
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Correction à apporter…" className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              <button onClick={() => { void run({ type: 'REPORT_REQUEST_CHANGES', userId: meId, comment }); setComment(''); }} className="px-4 py-2 rounded-xl bg-white border border-red-300 text-red-700 text-sm font-bold">Demander une correction</button>
            </div>
          )}
          {r.status === 'validated' && (
            <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2" data-testid="report-validated">
              ✅ Validé et enregistré dans la conversation. Visible uniquement par : {r.authorizedViewers.map(nameOf).join(', ')}. Empreinte {r.checksum}.
            </p>
          )}
        </>
      )}
    </div>
  );
};
