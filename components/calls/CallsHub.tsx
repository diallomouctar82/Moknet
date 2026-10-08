import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, Video, PhoneIncoming, Lock, FileText, Users, Bot } from 'lucide-react';
import { useCallClient, initialIdentity, rememberIdentity } from './useCallClient';
import { MeetingRoom, LanguageOptions } from './MeetingRoom';
import { DEMO_PEOPLE, EXPERT_DIRECTORY, findDemoPerson } from '../../services/meeting/directory';
import { CallMode, ExpertMeetingRole, EXPERT_ROLE_LABELS, MeetingState } from '../../services/meeting/types';
import { MeetingClient } from '../../services/meeting/meetingClient';
import { ConversationStore } from '../../services/meeting/conversationStore';
import { LangCode, languageLabel } from '../../services/meeting/languages';
import { ExpertType } from '../../types';

interface CallsHubProps {
  /** Faux quand une autre vue de l'application est affichée : l'appel continue en arrière-plan. */
  visible?: boolean;
  onOpen?: () => void;
}

export const CallsHub: React.FC<CallsHubProps> = ({ visible = true, onOpen }) => {
  const [identity, setIdentity] = useState(initialIdentity);
  const ctx = useCallClient(identity);
  if (!ctx) return <div className="p-8 text-slate-500">Connexion…</div>;
  const { client, store, aiMode } = ctx;
  const current = client.currentMeeting();
  const invites = client.incomingInvitations();

  return (
    <div className="h-full overflow-y-auto bg-slate-50 pb-28 md:pb-0" data-testid="calls-hub" data-identity={identity}>
      {!visible && (current || invites.length > 0) && createPortal(
        <button data-testid="call-return-banner" onClick={onOpen}
          className="fixed z-[90] bottom-24 md:bottom-6 right-4 left-4 md:left-auto md:w-96 bg-emerald-700 text-white rounded-2xl shadow-2xl px-4 py-3 text-left text-sm font-bold flex items-center gap-2">
          <PhoneIncoming size={18} />
          {invites.length > 0 ? `Invitation à un appel : ${invites[0].title} — ouvrir` : `Appel en cours : ${current!.title} — revenir`}
        </button>,
        document.body,
      )}
      {client.duplicateIdentity && (
        <div className="m-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm" role="alert" data-testid="duplicate-identity">
          Un autre onglet utilise déjà le profil « {client.me.name} ». Choisissez un autre profil ici (ou ajoutez ?as=… à l'adresse) pour éviter deux hôtes concurrents.
        </div>
      )}
      {invites.length > 0 && (
        <div className="sticky top-0 z-40 p-3 space-y-2">
          {invites.map(m => <IncomingInvite key={m.id} client={client} meeting={m} />)}
        </div>
      )}
      {current ? (
        <MeetingRoom client={client} meeting={current} aiMode={aiMode} />
      ) : (
        <div className="max-w-3xl mx-auto p-4 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
            <Users size={18} className="text-slate-500" />
            <label className="text-sm text-slate-700 flex items-center gap-2">
              Vous êtes
              <select data-testid="identity-select" value={identity} onChange={e => { rememberIdentity(e.target.value); setIdentity(e.target.value); }}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-sm font-bold">
                {DEMO_PEOPLE.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <span className="text-[11px] text-slate-400">Profil de démonstration (un par onglet).</span>
            <span className={`ml-auto text-[11px] px-2 py-1 rounded-full font-bold ${aiMode === 'gemini' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {aiMode === 'gemini' ? 'IA : Gemini' : 'IA hors ligne : traduction simulée, experts sans IA'}
            </span>
          </div>
          <NewCall client={client} />
          <Conversations client={client} store={store} />
        </div>
      )}
    </div>
  );
};

const IncomingInvite: React.FC<{ client: MeetingClient; meeting: MeetingState }> = ({ client, meeting }) => {
  const me = meeting.participants.find(p => p.id === client.me.id)!;
  const [lang, setLang] = useState<LangCode>(me.listenLang);
  const [error, setError] = useState<string | null>(null);
  const inviter = meeting.participants.find(p => p.id === me.invitedBy)?.name ?? 'Quelqu\'un';
  const others = meeting.participants.filter(p => p.status === 'joined' && p.id !== client.me.id);
  const respond = async (accept: boolean) => {
    try {
      setError(null);
      if (accept) await client.dispatch(meeting.id, { type: 'SET_LANG', userId: client.me.id, listenLang: lang, speakLang: me.speakLang });
      await client.dispatch(meeting.id, { type: 'RESPOND_INVITE', userId: client.me.id, accept });
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <div data-testid="incoming-invite" className="max-w-3xl mx-auto bg-brand-dark text-white rounded-2xl p-4 shadow-2xl border border-brand-gold/40">
      <p className="font-bold flex items-center gap-2"><PhoneIncoming size={18} className="text-brand-gold" /> {inviter} vous invite à un appel {meeting.mode === 'video' ? 'vidéo' : 'audio'}</p>
      <p className="text-xs text-slate-300 mt-1">« {meeting.title} » — déjà présents : {others.map(o => o.kind === 'expert' ? `${o.name} (IA)` : o.name).join(', ')}</p>
      {meeting.noteTaking.status !== 'off' && (
        <p className="text-xs text-amber-300 mt-1">Une prise de notes est proposée dans cet appel : votre accord vous sera demandé.</p>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <label className="text-xs text-slate-300 flex items-center gap-1">J'écoute en
          <select data-testid="invite-listen-lang" value={lang} onChange={e => setLang(e.target.value as LangCode)} className="text-slate-900 p-1 rounded-lg text-xs">
            <LanguageOptions />
          </select>
        </label>
        <button data-testid="invite-accept" onClick={() => respond(true)} className="ml-auto px-4 py-2 rounded-xl bg-emerald-500 font-bold text-sm">Accepter</button>
        <button data-testid="invite-decline" onClick={() => respond(false)} className="px-4 py-2 rounded-xl bg-red-600 font-bold text-sm">Refuser</button>
      </div>
      {error && <p className="text-xs text-red-300 mt-2">{error}</p>}
    </div>
  );
};

const NewCall: React.FC<{ client: MeetingClient }> = ({ client }) => {
  const [mode, setMode] = useState<CallMode>('audio');
  const [title, setTitle] = useState('');
  const [first, setFirst] = useState<string>(() => DEMO_PEOPLE.find(p => p.id !== client.me.id)!.id);
  const [role, setRole] = useState<ExpertMeetingRole>('ADVISOR');
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    try {
      setError(null);
      const m = client.startCall({ mode, title });
      if (first.startsWith('expert:')) {
        await client.dispatch(m.id, { type: 'INVITE_EXPERT', by: client.me.id, expertType: first.slice(7) as ExpertType, role });
      } else {
        const p = findDemoPerson(first)!;
        await client.dispatch(m.id, { type: 'INVITE_PERSON', by: client.me.id, person: { id: p.id, name: p.name, lang: p.lang } });
      }
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4" aria-label="Nouvel appel">
      <h2 className="font-bold text-slate-900">Nouvel appel</h2>
      <div className="flex gap-2">
        <button data-testid="new-call-mode-audio" onClick={() => setMode('audio')} className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${mode === 'audio' ? 'bg-brand-dark text-white' : 'bg-slate-100 text-slate-600'}`}><Phone size={16} /> Audio</button>
        <button data-testid="new-call-mode-video" onClick={() => setMode('video')} className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${mode === 'video' ? 'bg-brand-dark text-white' : 'bg-slate-100 text-slate-600'}`}><Video size={16} /> Vidéo</button>
      </div>
      <input data-testid="new-call-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Sujet de l'appel (facultatif)" className="w-full p-3 rounded-xl border border-slate-200 text-sm" />
      <label className="block text-xs font-bold text-slate-600">Appeler d'abord
        <select data-testid="new-call-first" value={first} onChange={e => setFirst(e.target.value)} className="mt-1 w-full p-3 rounded-xl border border-slate-200 bg-white text-sm font-normal">
          <optgroup label="Personnes">
            {DEMO_PEOPLE.filter(p => p.id !== client.me.id).map(p => <option key={p.id} value={p.id}>{p.name} — {languageLabel(p.lang)}</option>)}
          </optgroup>
          <optgroup label="Experts MokNet (IA)">
            {EXPERT_DIRECTORY.map(e => <option key={e.type} value={`expert:${e.type}`}>{e.name} — {e.domain}</option>)}
          </optgroup>
        </select>
      </label>
      {first.startsWith('expert:') && (
        <select value={role} onChange={e => setRole(e.target.value as ExpertMeetingRole)} className="w-full p-2 rounded-xl border border-slate-200 bg-white text-sm">
          {(Object.keys(EXPERT_ROLE_LABELS) as ExpertMeetingRole[]).map(r => <option key={r} value={r}>{EXPERT_ROLE_LABELS[r]}</option>)}
        </select>
      )}
      <button data-testid="start-call" onClick={start} className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2">
        {mode === 'video' ? <Video size={18} /> : <Phone size={18} />} Démarrer l'appel
      </button>
      <p className="text-[11px] text-slate-500">Vous pourrez ajouter d'autres personnes et des experts pendant l'appel, sans raccrocher.</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
};

const Conversations: React.FC<{ client: MeetingClient; store: ConversationStore }> = ({ client, store }) => {
  const list = store.listFor(client.me.id);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3" aria-label="Conversations d'appel">
      <h2 className="font-bold text-slate-900 flex items-center gap-2"><FileText size={18} /> Conversations d'appel</h2>
      {!list.length && <p className="text-sm text-slate-400">Aucune conversation pour le moment.</p>}
      {list.map(c => {
        const hidden = store.hiddenReportsFor(client.me.id, c.id);
        return (
          <div key={c.id} data-testid="conversation" className="border border-slate-100 rounded-xl p-3">
            <p className="font-bold text-sm text-slate-800">{c.title}</p>
            <p className="text-[11px] text-slate-500">{c.memberIds.map(id => findDemoPerson(id)?.name ?? id).join(', ')}</p>
            {c.messages.filter(m => m.kind === 'report').map(m => (
              <div key={m.id} data-testid="report-message" className="mt-2">
                <button onClick={() => setOpen(open === m.id ? null : m.id)} className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <Lock size={12} /> {m.text} — validé par {m.report!.approvedBy.length} · accès : {m.report!.authorizedViewers.map(id => findDemoPerson(id)?.name ?? id).join(', ')}
                </button>
                {open === m.id && <pre data-testid="report-message-text" className="mt-2 whitespace-pre-wrap text-xs bg-slate-50 p-3 rounded-xl font-sans">{m.report!.text}</pre>}
              </div>
            ))}
            {hidden > 0 && (
              <p data-testid="report-hidden" className="text-[11px] text-slate-500 mt-2 flex items-center gap-1"><Lock size={11} /> {hidden} compte(s)-rendu(s) réservé(s) aux participants qui l'ont validé.</p>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-slate-400 flex items-center gap-1"><Bot size={11} /> Stockage local de démonstration : le contrôle d'accès devra être appliqué par le serveur en production.</p>
    </section>
  );
};
