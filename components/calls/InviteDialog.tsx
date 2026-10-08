import React, { useState } from 'react';
import { X, UserPlus, Bot } from 'lucide-react';
import { DEMO_PEOPLE, EXPERT_DIRECTORY } from '../../services/meeting/directory';
import { EXPERT_ROLE_LABELS, ExpertMeetingRole, MeetingState } from '../../services/meeting/types';
import { languageLabel } from '../../services/meeting/languages';
import { ExpertType } from '../../types';

interface Props {
  meeting: MeetingState;
  meId: string;
  onInvitePerson: (personId: string) => void;
  onInviteExpert: (type: ExpertType, role: ExpertMeetingRole) => void;
  onClose: () => void;
}

export const InviteDialog: React.FC<Props> = ({ meeting, meId, onInvitePerson, onInviteExpert, onClose }) => {
  const [tab, setTab] = useState<'people' | 'experts'>('people');
  const [role, setRole] = useState<ExpertMeetingRole>('ADVISOR');
  const statusOf = (id: string) => meeting.participants.find(p => p.id === id)?.status;

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4" role="dialog" aria-modal="true" aria-label="Ajouter un participant">
      <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><UserPlus size={18} /> Ajouter un participant</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100" aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="flex gap-2 px-5 pt-4">
          <button onClick={() => setTab('people')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'people' ? 'bg-brand-dark text-white' : 'bg-slate-100 text-slate-600'}`}>Personnes</button>
          <button onClick={() => setTab('experts')} data-testid="invite-tab-experts" className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'experts' ? 'bg-brand-dark text-white' : 'bg-slate-100 text-slate-600'}`}>Experts MokNet</button>
        </div>

        <div className="p-5 overflow-y-auto space-y-2">
          {tab === 'people' && (
            <>
              <p className="text-xs text-slate-500">La personne reçoit une invitation qu'elle peut accepter ou refuser. L'appel continue pendant ce temps.</p>
              {DEMO_PEOPLE.filter(p => p.id !== meId).map(p => {
                const st = statusOf(p.id);
                const busy = st === 'joined' || st === 'invited';
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100">
                    <div>
                      <div className="font-bold text-sm text-slate-800">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.city} · {languageLabel(p.lang)}</div>
                    </div>
                    <button
                      data-testid={`invite-person-${p.id}`}
                      disabled={busy}
                      onClick={() => onInvitePerson(p.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white disabled:bg-slate-200 disabled:text-slate-500"
                    >
                      {st === 'joined' ? 'Dans l\'appel' : st === 'invited' ? 'Invité…' : st === 'declined' ? 'Réinviter' : 'Inviter'}
                    </button>
                  </div>
                );
              })}
              <p className="text-[11px] text-slate-400 pt-2">Annuaire de démonstration : en production, la liste viendra des contacts MokNet.</p>
            </>
          )}

          {tab === 'experts' && (
            <>
              <label className="block text-xs font-bold text-slate-600">Compétence de collaboration</label>
              <select data-testid="invite-expert-role" value={role} onChange={e => setRole(e.target.value as ExpertMeetingRole)} className="w-full p-2 rounded-lg border border-slate-200 text-sm bg-white">
                {(Object.keys(EXPERT_ROLE_LABELS) as ExpertMeetingRole[]).map(r => <option key={r} value={r}>{EXPERT_ROLE_LABELS[r]}</option>)}
              </select>
              {role !== 'ADVISOR' && (
                <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2">
                  Ce rôle exploite la transcription : la prise de notes sera annoncée à tous et ne démarrera qu'avec l'accord de chaque participant.
                </p>
              )}
              {EXPERT_DIRECTORY.map(e => {
                const st = statusOf(`expert:${e.type}`);
                return (
                  <div key={e.type} className="flex items-center justify-between p-3 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${e.color} text-white flex items-center justify-center`}><Bot size={16} /></div>
                      <div>
                        <div className="font-bold text-sm text-slate-800">{e.name} <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">IA</span></div>
                        <div className="text-xs text-slate-500">{e.domain}</div>
                      </div>
                    </div>
                    <button
                      data-testid={`invite-expert-${e.type}`}
                      onClick={() => onInviteExpert(e.type, role)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-dark text-white"
                    >
                      {st === 'joined' ? 'Changer de rôle' : 'Inviter'}
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
