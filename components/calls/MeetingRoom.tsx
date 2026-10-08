import React, { useEffect, useRef, useState } from 'react';
import { Bot, Mic, MicOff, PhoneOff, UserPlus, Video, VideoOff, Send, Languages, NotebookPen, Headphones, MessageSquare, RefreshCw } from 'lucide-react';
import { MeetingClient } from '../../services/meeting/meetingClient';
import { MeetingIntent, MeetingState, Participant, EXPERT_ROLE_LABELS, Caption } from '../../services/meeting/types';
import { dictationLocale, LangCode, languageLabel, listenableLanguages, getLanguage } from '../../services/meeting/languages';
import { findDemoPerson, EXPERT_DIRECTORY } from '../../services/meeting/directory';
import { joinedHumans } from '../../services/meeting/meetingCore';
import { AiMode } from '../../services/meeting/runtime';
import { MediaMesh } from '../../services/meeting/mediaMesh';
import { InviteDialog } from './InviteDialog';
import { SharedWorkspace } from './SharedWorkspace';
import { useMediaMesh } from './useCallClient';
import { useDictation } from './useDictation';

interface Props { client: MeetingClient; meeting: MeetingState; aiMode: AiMode }

const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const MeetingRoom: React.FC<Props> = ({ client, meeting, aiMode }) => {
  const meId = client.me.id;
  const me = meeting.participants.find(p => p.id === meId)!;
  const mesh = useMediaMesh(client, meeting);
  const [showInvite, setShowInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const dispatch = async (intent: MeetingIntent) => {
    try { setError(null); return await client.dispatch(meeting.id, intent); }
    catch (e) { setError((e as Error).message); throw e; }
  };
  const safe = (intent: MeetingIntent) => { void dispatch(intent).catch(() => undefined); };

  const isHost = meeting.hostId === meId;
  const humans = meeting.participants.filter(p => p.kind === 'human' && (p.status === 'joined' || p.status === 'invited'));
  const experts = meeting.participants.filter(p => p.kind === 'expert' && p.status === 'joined');
  const nt = meeting.noteTaking;
  const myConsent = nt.consents[meId];
  const present = joinedHumans(meeting);
  const accepted = present.filter(p => nt.consents[p.id] === 'accepted').length;

  return (
    <div className="min-h-full bg-slate-100" data-testid="meeting-room" data-mode={meeting.mode}>
      {/* Barre d'appel */}
      <header className="sticky top-0 z-30 bg-brand-dark text-white px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
        <div className="flex-1 min-w-[160px]">
          <h2 className="font-bold text-sm truncate">{meeting.title}</h2>
          <p className="text-[11px] text-slate-300 flex items-center gap-2 flex-wrap">
            <span className="bg-white/10 px-1.5 py-0.5 rounded" data-testid="call-mode">{meeting.mode === 'video' ? 'Vidéo' : 'Audio'}</span>
            <span className="font-mono">{fmtDuration(now - meeting.createdAt)}</span>
            <span>{present.length} personne(s){experts.length ? ` + ${experts.length} expert(s) IA` : ''}</span>
            <span className={`px-1.5 py-0.5 rounded ${aiMode === 'gemini' ? 'bg-emerald-700' : 'bg-amber-600'}`} data-testid="ai-mode">
              {aiMode === 'gemini' ? 'IA : Gemini' : 'IA hors ligne — traduction simulée'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button data-testid="add-participant" onClick={() => setShowInvite(true)} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold flex items-center gap-1.5">
            <UserPlus size={16} /> Ajouter un participant
          </button>
          <button data-testid="switch-mode" onClick={() => safe({ type: 'SET_MODE', by: meId, mode: meeting.mode === 'video' ? 'audio' : 'video' })}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5" title="Changer de mode pour tout l'appel">
            {meeting.mode === 'video' ? <><Headphones size={16} /> Passer en audio</> : <><Video size={16} /> Passer en vidéo</>}
          </button>
          <button onClick={() => { const m = !me.muted; mesh?.setMuted(m); safe({ type: 'SET_MEDIA', userId: meId, muted: m }); }}
            className={`p-2 rounded-xl ${me.muted ? 'bg-white text-slate-900' : 'bg-white/10'}`} aria-label={me.muted ? 'Réactiver le micro' : 'Couper le micro'}>
            {me.muted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          {meeting.mode === 'video' && (
            <button onClick={() => { const c = !(me.camOn ?? true); mesh?.setCamera(c); safe({ type: 'SET_MEDIA', userId: meId, camOn: c }); }}
              className={`p-2 rounded-xl ${me.camOn === false ? 'bg-white text-slate-900' : 'bg-white/10'}`} aria-label={me.camOn === false ? 'Activer la caméra' : 'Couper la caméra'}>
              {me.camOn === false ? <VideoOff size={16} /> : <Video size={16} />}
            </button>
          )}
          <button data-testid="leave-call" onClick={() => safe({ type: 'LEAVE', userId: meId })} className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold flex items-center gap-1.5">
            <PhoneOff size={16} /> Quitter
          </button>
          {isHost && (
            <button data-testid="end-call" onClick={() => safe({ type: 'END', by: meId })} className="px-3 py-2 rounded-xl bg-red-900 hover:bg-red-800 text-xs font-bold">Terminer pour tous</button>
          )}
        </div>
      </header>

      {error && <div className="mx-4 mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm" role="alert">{error}</div>}
      {mesh?.mediaError && <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm" role="status">{mesh.mediaError}</div>}

      {/* Consentement à la prise de notes */}
      {(nt.status === 'requested' || nt.status === 'paused') && myConsent === 'pending' && (
        <div className="mx-4 mt-3 p-4 rounded-2xl bg-amber-50 border-2 border-amber-300" role="alertdialog" aria-label="Accord pour la prise de notes" data-testid="consent-banner">
          <p className="text-sm text-amber-950 font-bold flex items-center gap-2"><NotebookPen size={16} /> Prise de notes : votre accord est demandé</p>
          <p className="text-sm text-amber-900 mt-1">{nt.announcement}</p>
          <div className="flex gap-2 mt-3">
            <button data-testid="consent-accept" onClick={() => safe({ type: 'CONSENT', userId: meId, accept: true })} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">J'accepte</button>
            <button data-testid="consent-refuse" onClick={() => safe({ type: 'CONSENT', userId: meId, accept: false })} className="px-4 py-2 rounded-xl bg-white border border-red-300 text-red-700 text-sm font-bold">Je refuse</button>
          </div>
        </div>
      )}

      <div className="p-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_440px] gap-4">
        <div className="space-y-4 min-w-0">
          {/* Participants */}
          <section className={`grid gap-3 ${meeting.mode === 'video' ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5'}`} aria-label="Participants">
            {humans.map(p => <HumanTile key={p.id} p={p} meId={meId} mode={meeting.mode} mesh={mesh} />)}
            {experts.map(p => <ExpertTile key={p.id} p={p} mode={meeting.mode} />)}
          </section>

          {/* Langues et prise de notes */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-4 items-end">
            <label className="text-xs font-bold text-slate-600 flex flex-col gap-1">
              <span className="flex items-center gap-1"><Languages size={14} /> J'écoute en</span>
              <select data-testid="listen-lang" value={me.listenLang} onChange={e => safe({ type: 'SET_LANG', userId: meId, listenLang: e.target.value as LangCode })} className="p-2 rounded-lg border border-slate-200 bg-white text-sm font-normal">
                <LanguageOptions />
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600 flex flex-col gap-1">
              <span>Je parle</span>
              <select data-testid="speak-lang" value={me.speakLang} onChange={e => safe({ type: 'SET_LANG', userId: meId, speakLang: e.target.value as LangCode })} className="p-2 rounded-lg border border-slate-200 bg-white text-sm font-normal">
                <LanguageOptions />
              </select>
            </label>
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs font-bold text-slate-600 mb-1 flex items-center gap-1"><NotebookPen size={14} /> Prise de notes</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span data-testid="notes-status" data-status={nt.status} className={`text-xs px-2 py-1 rounded-full font-bold ${
                  nt.status === 'active' ? 'bg-emerald-100 text-emerald-800' : nt.status === 'refused' ? 'bg-red-100 text-red-800' : nt.status === 'off' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>
                  {nt.status === 'active' ? 'Active — acceptée par tous' : nt.status === 'off' ? 'Désactivée' : nt.status === 'refused' ? 'Refusée — rien n\'est conservé'
                    : `En attente d'accord (${accepted}/${present.length}) — rien n'est conservé`}
                </span>
                {(nt.status === 'off' || nt.status === 'refused') && (
                  <button onClick={() => safe({ type: 'REQUEST_NOTES', by: meId })} className="text-xs font-bold text-blue-700 underline">Demander une prise de notes</button>
                )}
                {nt.status !== 'off' && (
                  <button onClick={() => safe({ type: 'STOP_NOTES', by: meId })} className="text-xs font-bold text-red-700 underline">Arrêter</button>
                )}
              </div>
            </div>
          </section>

          <CaptionsPanel meeting={meeting} meId={meId} me={me} dispatch={safe} />
          <ExpertsPanel meeting={meeting} meId={meId} dispatch={safe} />

          <section className="bg-white rounded-2xl border border-slate-200 p-4" aria-label="Journal de l'appel">
            <h3 className="font-bold text-sm text-slate-900 mb-2">Journal de l'appel</h3>
            <ul className="space-y-1 max-h-48 overflow-y-auto text-xs" data-testid="call-log">
              {meeting.log.slice(-12).reverse().map((l, i) => (
                <li key={i} className={l.kind === 'consent' ? 'text-amber-800' : l.kind === 'warning' ? 'text-red-700' : 'text-slate-600'}>
                  <span className="font-mono text-slate-400 mr-1">{new Date(l.at).toLocaleTimeString()}</span>{l.text}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <SharedWorkspace meeting={meeting} meId={meId} dispatch={dispatch} />
      </div>

      {showInvite && (
        <InviteDialog
          meeting={meeting} meId={meId}
          onClose={() => setShowInvite(false)}
          onInvitePerson={(id) => { const p = findDemoPerson(id); if (p) safe({ type: 'INVITE_PERSON', by: meId, person: { id: p.id, name: p.name, lang: p.lang } }); setShowInvite(false); }}
          onInviteExpert={(type, role) => { safe({ type: 'INVITE_EXPERT', by: meId, expertType: type, role }); setShowInvite(false); }}
        />
      )}
    </div>
  );
};

export const LanguageOptions: React.FC = () => (
  <>
    <optgroup label="Prises en charge">
      {listenableLanguages(false).map(l => <option key={l.code} value={l.code}>{l.name}{l.dictation ? '' : ' (sans dictée)'}</option>)}
    </optgroup>
    <optgroup label="Expérimentales (sous-titres écrits, qualité non garantie)">
      {listenableLanguages().filter(l => l.captions === 'experimental').map(l => <option key={l.code} value={l.code}>{l.name} — expérimental</option>)}
    </optgroup>
  </>
);

const MediaElement: React.FC<{ stream: MediaStream; muted?: boolean; video: boolean; testId: string }> = ({ stream, muted, video, testId }) => {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  });
  return video
    ? <video ref={ref} data-testid={testId} autoPlay playsInline muted={muted} className="absolute inset-0 w-full h-full object-cover" />
    : <audio ref={ref} data-testid={testId} autoPlay muted={muted} />;
};

const HumanTile: React.FC<{ p: Participant; meId: string; mode: 'audio' | 'video'; mesh: MediaMesh | null }> = ({ p, meId, mode, mesh }) => {
  const isMe = p.id === meId;
  const stream = isMe ? mesh?.localStream ?? undefined : mesh?.remoteStream(p.id);
  const hasVideo = mode === 'video' && !!stream && stream.getVideoTracks().length > 0 && p.camOn !== false;
  return (
    <div data-testid={`tile-${p.id}`} data-status={p.status}
      className={`relative rounded-2xl overflow-hidden bg-slate-800 text-white ${mode === 'video' ? 'aspect-video' : 'aspect-square'} flex items-center justify-center ${p.status === 'invited' ? 'opacity-60 animate-pulse' : ''}`}>
      {stream && p.status === 'joined' && <MediaElement stream={stream} muted={isMe} video={hasVideo} testId={`media-${p.id}`} />}
      {!hasVideo && (
        <div className="w-14 h-14 rounded-full bg-brand-gold text-brand-dark font-bold flex items-center justify-center text-xl">{p.name.charAt(0)}</div>
      )}
      <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-[11px] flex items-center gap-1">
        {p.muted ? <MicOff size={11} /> : <Mic size={11} />}
        <span className="font-bold truncate">{p.name}{isMe ? ' (vous)' : ''}</span>
        <span className="ml-auto opacity-80">{p.status === 'invited' ? 'invitation…' : getLanguage(p.listenLang)?.code.toUpperCase()}</span>
      </div>
    </div>
  );
};

const ExpertTile: React.FC<{ p: Participant; mode: 'audio' | 'video' }> = ({ p, mode }) => {
  const meta = EXPERT_DIRECTORY.find(e => e.type === p.expertType);
  return (
    <div data-testid={`tile-${p.id}`} className={`relative rounded-2xl overflow-hidden bg-slate-900 text-white ${mode === 'video' ? 'aspect-video' : 'aspect-square'} flex flex-col items-center justify-center p-2 text-center border border-white/10`}>
      <div className={`w-12 h-12 rounded-full ${meta?.color ?? 'bg-slate-600'} flex items-center justify-center`}><Bot size={22} /></div>
      <p className="text-[11px] font-bold mt-2">{p.name}</p>
      <p className="text-[10px] text-slate-300">Expert IA · {p.expertRole ? EXPERT_ROLE_LABELS[p.expertRole].split(' (')[0] : ''}</p>
    </div>
  );
};

const captionText = (c: Caption, lang: LangCode) => {
  if (c.sourceLang === lang) return { text: c.text, note: null as string | null };
  const t = c.translations[lang];
  if (t?.status === 'ok' && t.text) return { text: t.text, note: t.experimental ? 'traduction expérimentale' : null };
  if (t?.status === 'failed') return { text: c.text, note: 'traduction indisponible — texte original' };
  return { text: c.text, note: 'traduction en cours…' };
};

const CaptionsPanel: React.FC<{ meeting: MeetingState; meId: string; me: Participant; dispatch: (i: MeetingIntent) => void }> = ({ meeting, meId, me, dispatch }) => {
  const [text, setText] = useState('');
  const send = (t: string) => { if (t.trim()) dispatch({ type: 'UTTERANCE', userId: meId, text: t.trim(), lang: me.speakLang }); setText(''); };
  const dictation = useDictation(dictationLocale(me.speakLang), (t) => send(t));
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [meeting.captions.length]);
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4" aria-label="Sous-titres traduits">
      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2"><MessageSquare size={16} /> Sous-titres en {languageLabel(me.listenLang)}</h3>
      <p className="text-[11px] text-slate-500">Chaque intervention est traduite une fois par langue d'écoute. Sans accord de tous, rien n'est conservé après l'appel.</p>
      <ul className="mt-3 space-y-2 max-h-64 overflow-y-auto" data-testid="captions">
        {meeting.captions.map(c => {
          const { text: shown, note } = captionText(c, me.listenLang);
          return (
            <li key={c.id} data-testid="caption" data-speaker={c.speakerId} className={`text-sm p-2 rounded-xl ${c.kind === 'expert' ? 'bg-indigo-50' : 'bg-slate-50'}`}>
              <span className="font-bold text-slate-800">{c.speakerName}{c.kind === 'expert' ? ' (IA)' : ''} : </span>
              <span data-testid="caption-text">{shown}</span>
              {note && <span className="block text-[10px] text-slate-500">{note}</span>}
              {c.sourceLang !== me.listenLang && <span className="block text-[10px] text-slate-400">original ({c.sourceLang}) : {c.text}</span>}
            </li>
          );
        })}
        <div ref={endRef} />
      </ul>
      <div className="flex gap-2 mt-3">
        <input data-testid="speak-input" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send(text)}
          placeholder={`Dire quelque chose en ${languageLabel(me.speakLang)}…`} className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-brand-gold" aria-label="Intervention écrite" />
        <button onClick={dictation.toggle} disabled={!dictation.available} title={dictation.available ? 'Parler (dictée)' : 'Dictée indisponible dans votre langue ou ce navigateur'}
          className={`p-2 rounded-xl ${dictation.listening ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'} disabled:opacity-40`} aria-label="Parler">
          {dictation.listening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button data-testid="speak-send" onClick={() => send(text)} className="p-2 rounded-xl bg-brand-dark text-white" aria-label="Envoyer"><Send size={18} /></button>
      </div>
      {dictation.error && <p className="text-[11px] text-amber-700 mt-1">{dictation.error}</p>}
    </section>
  );
};

const ExpertsPanel: React.FC<{ meeting: MeetingState; meId: string; dispatch: (i: MeetingIntent) => void }> = ({ meeting, meId, dispatch }) => {
  const experts = meeting.participants.filter(p => p.kind === 'expert' && p.status === 'joined');
  const [question, setQuestion] = useState('');
  if (!experts.length) return null;
  const advisor = experts.find(e => e.expertRole === 'ADVISOR');
  const mine = meeting.expertMessages.filter(m => m.askedBy === meId).slice(-3);
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3" aria-label="Experts IA">
      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2"><Bot size={16} /> Experts IA dans l'appel</h3>
      {experts.map(e => (
        <div key={e.id} className="flex items-center justify-between gap-2 text-xs">
          <span><b>{e.name}</b> — {e.expertRole ? EXPERT_ROLE_LABELS[e.expertRole] : ''}</span>
          {e.expertRole !== 'ADVISOR' && (
            <button disabled={meeting.noteTaking.status !== 'active'} onClick={() => dispatch({ type: 'REFRESH_EXPERT', by: meId, expertId: e.id })}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 font-bold disabled:opacity-40" title={meeting.noteTaking.status !== 'active' ? 'Nécessite l\'accord de tous' : ''}>
              <RefreshCw size={12} /> {e.expertRole === 'NOTE_TAKER' ? 'Extraire les notes' : 'Mettre à jour le récap'}
            </button>
          )}
        </div>
      ))}
      {advisor && (
        <div className="flex gap-2">
          <input data-testid="ask-expert-input" value={question} onChange={e => setQuestion(e.target.value)} placeholder={`Question à ${advisor.name} (réponse dans votre langue)`}
            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-100 text-sm" />
          <button data-testid="ask-expert-send" onClick={() => { if (question.trim()) dispatch({ type: 'ASK_EXPERT', by: meId, expertId: advisor.id, question }); setQuestion(''); }}
            className="px-3 rounded-xl bg-indigo-600 text-white text-xs font-bold">Demander</button>
        </div>
      )}
      {mine.map(m => (
        <p key={m.id} className="text-xs text-slate-700" data-testid="expert-answer" data-status={m.status}>
          <b>Vous :</b> {m.question}<br />
          <b>{m.expertName} :</b> {m.status === 'pending' ? 'réflexion…' : m.status === 'failed' ? 'réponse indisponible (service IA non configuré ou en erreur)' : m.answer}
        </p>
      ))}
    </section>
  );
};
