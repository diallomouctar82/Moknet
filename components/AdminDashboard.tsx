
import React, { useState, useEffect } from 'react';
import { 
  Users, Activity, Server, Shield, Globe, 
  TrendingUp, AlertTriangle, Zap, BarChart3,
  MessageSquare, GraduationCap, Video, Mic, Settings, CreditCard, Save, RotateCcw, UserPlus, Trash2, Edit2
} from 'lucide-react';
import { ExpertType, AdminRole, AdminUser, VoiceModel } from '../types';
import { getVoiceModels, saveVoiceModel, assignVoiceToAgent, BASE_INSTRUCTION, saveSystemInstruction, resetSystemInstruction } from '../services/geminiService';

const PRIMARY_ADMIN = 'visionsmart224@gmail.com';

const Experts = [
  { id: ExpertType.DIALLO, name: 'Diallo' },
  { id: ExpertType.MAITRE, name: 'Maître Diallo' },
  { id: ExpertType.DOCTEUR, name: 'Dr. Diallo' },
  { id: ExpertType.PROFESSEUR, name: 'Prof. Diallo' },
  { id: ExpertType.CONSEILLER, name: 'Conseiller Diallo' },
  { id: ExpertType.MONSIEUR, name: 'M. Diallo' },
  { id: ExpertType.GUIDE, name: 'Guide Diallo' },
];

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'USERS' | 'SUBSCRIPTIONS' | 'VOICE_AI' | 'AGENTS'>('OVERVIEW');
  const [admins, setAdmins] = useState<AdminUser[]>([
      { id: '1', email: PRIMARY_ADMIN, role: AdminRole.SUPER_ADMIN, addedBy: 'System', lastActive: 'Maintenant' },
      { id: '2', email: 'moderateur@mok.com', role: AdminRole.CONTENT_MANAGER, addedBy: PRIMARY_ADMIN, lastActive: '2h' }
  ]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<AdminRole>(AdminRole.CONTENT_MANAGER);

  // Voice State
  const [voiceModels, setVoiceModels] = useState<VoiceModel[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // Agent Management State
  const [selectedAgent, setSelectedAgent] = useState<ExpertType>(ExpertType.DIALLO);
  const [agentPrompt, setAgentPrompt] = useState(BASE_INSTRUCTION);

  useEffect(() => {
      setVoiceModels(getVoiceModels());
  }, []);

  const handleAddAdmin = () => {
      if (!newAdminEmail) return;
      const newAdmin: AdminUser = {
          id: Date.now().toString(),
          email: newAdminEmail,
          role: newAdminRole,
          addedBy: PRIMARY_ADMIN,
          lastActive: 'Jamais'
      };
      setAdmins([...admins, newAdmin]);
      setNewAdminEmail('');
  };

  const handleRecordVoice = () => {
      if (isRecording) {
          setIsRecording(false);
          // Simulate saving recorded voice
          const newModel: VoiceModel = {
              id: `voice-${Date.now()}`,
              name: `Clonage Vocal ${new Date().toLocaleTimeString()}`,
              source: 'CLONED'
          };
          saveVoiceModel(newModel);
          setVoiceModels(getVoiceModels());
      } else {
          setIsRecording(true);
          // Simulate recording timer
      }
  };

  const handleAssignVoice = (voiceId: string, expert: ExpertType) => {
      assignVoiceToAgent(voiceId, expert);
      setVoiceModels(getVoiceModels()); // Refresh to update assignments
  };

  const handleSavePrompt = () => {
      saveSystemInstruction(selectedAgent, agentPrompt);
      alert("Instructions système mises à jour pour " + selectedAgent);
  };

  return (
    <div className="h-full bg-slate-100 overflow-y-auto p-6 font-sans">
      <header className="mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-2xl font-bold text-brand-dark flex items-center gap-2">
                <Shield className="text-brand-gold" /> MOK ADMIN CONSOLE
                </h1>
                <p className="text-slate-500 text-sm mt-1">Connecté en tant que <span className="font-bold text-brand-accent">{PRIMARY_ADMIN}</span> (Super Admin)</p>
            </div>
            <div className="flex gap-2">
                <TabButton active={activeTab === 'OVERVIEW'} onClick={() => setActiveTab('OVERVIEW')} icon={<Activity size={16}/>} label="Vue Globale" />
                <TabButton active={activeTab === 'USERS'} onClick={() => setActiveTab('USERS')} icon={<Users size={16}/>} label="Gestion Accès" />
                <TabButton active={activeTab === 'SUBSCRIPTIONS'} onClick={() => setActiveTab('SUBSCRIPTIONS')} icon={<CreditCard size={16}/>} label="Abonnements" />
                <TabButton active={activeTab === 'VOICE_AI'} onClick={() => setActiveTab('VOICE_AI')} icon={<Mic size={16}/>} label="IA & Voix" />
                <TabButton active={activeTab === 'AGENTS'} onClick={() => setActiveTab('AGENTS')} icon={<Settings size={16}/>} label="Agents" />
            </div>
        </div>
      </header>

      {/* --- OVERVIEW TAB --- */}
      {activeTab === 'OVERVIEW' && (
          <div className="space-y-6 animate-in fade-in">
            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Utilisateurs" value="1.2M" trend="+12%" icon={<Users className="text-white" size={24} />} color="bg-blue-600" />
                <StatCard title="Lives Actifs" value="45" trend="+5" icon={<Video className="text-white" size={24} />} color="bg-red-500" />
                <StatCard title="Revenus (Crédits)" value="450k €" trend="+8%" icon={<CreditCard className="text-white" size={24} />} color="bg-brand-gold" />
                <StatCard title="Requêtes IA" value="850/s" trend="Stable" icon={<Zap className="text-white" size={24} />} color="bg-purple-600" />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><BarChart3 size={18} /> Sollicitation des Experts</h3>
                    <div className="space-y-4">
                        <UsageBar name="Maître Diallo (Juridique)" count="45%" color="bg-red-600" />
                        <UsageBar name="Dr. Diallo (Santé)" count="25%" color="bg-green-600" />
                        <UsageBar name="Professeur Diallo (Éducation)" count="15%" color="bg-yellow-500" />
                        <UsageBar name="Diallo (Communication)" count="10%" color="bg-blue-600" />
                        <UsageBar name="Conseiller Diallo (Emploi)" count="5%" color="bg-purple-600" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Server size={18} /> État des Systèmes</h3>
                    <div className="space-y-3 flex-1">
                        <SystemStatus name="API Gemini Pro" status="Opérationnel" ping="24ms" />
                        <SystemStatus name="Veo Video Gen" status="Opérationnel" ping="120ms" />
                        <SystemStatus name="Serveurs Live Audio" status="Charge Élevée" ping="45ms" color="text-yellow-500" />
                        <SystemStatus name="Base de Données MOK" status="Opérationnel" ping="12ms" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Globe size={18} /> Top Régions Actives</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                            <span className="font-bold text-slate-700">1. Sénégal</span>
                            <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded">+15%</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                            <span className="font-bold text-slate-700">2. Côte d'Ivoire</span>
                            <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded">+8%</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                            <span className="font-bold text-slate-700">3. France (Diaspora)</span>
                            <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded">Stable</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><AlertTriangle size={18} className="text-red-500" /> Modération (Prioritaire)</h3>
                    <div className="space-y-3">
                        <div className="p-3 border-l-4 border-red-500 bg-red-50 rounded-r-lg">
                            <p className="text-xs font-bold text-red-700 mb-1">Signalement Live #4829</p>
                            <p className="text-xs text-slate-600">Contenu inapproprié détecté par l'IA. Vérification requise.</p>
                        </div>
                        <div className="p-3 border-l-4 border-yellow-500 bg-yellow-50 rounded-r-lg">
                            <p className="text-xs font-bold text-yellow-700 mb-1">Commentaire Toxique</p>
                            <p className="text-xs text-slate-600">Utilisateur @user123 a été signalé 5 fois.</p>
                        </div>
                    </div>
                </div>
            </div>
          </div>
      )}

      {/* --- ACCESS MANAGEMENT TAB --- */}
      {activeTab === 'USERS' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-brand-dark">
                  <Shield size={20} className="text-brand-gold"/> Gestion des Administrateurs
              </h3>
              
              {/* Add Admin Form */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 flex gap-4 items-end">
                  <div className="flex-1">
                      <label className="text-xs font-bold text-slate-500 block mb-1">Email du nouvel administrateur</label>
                      <input 
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        className="w-full p-2 rounded-lg border border-slate-300 outline-none" 
                        placeholder="email@exemple.com" 
                      />
                  </div>
                  <div className="w-48">
                      <label className="text-xs font-bold text-slate-500 block mb-1">Rôle</label>
                      <select 
                        value={newAdminRole}
                        onChange={(e) => setNewAdminRole(e.target.value as AdminRole)}
                        className="w-full p-2 rounded-lg border border-slate-300 outline-none bg-white"
                      >
                          <option value={AdminRole.GLOBAL_ADMIN}>Admin Global</option>
                          <option value={AdminRole.CONTENT_MANAGER}>Gest. Contenu</option>
                          <option value={AdminRole.AGENT_MANAGER}>Gest. IA & Agents</option>
                      </select>
                  </div>
                  <button onClick={handleAddAdmin} className="bg-brand-dark text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-800">
                      <UserPlus size={16} /> Ajouter
                  </button>
              </div>

              {/* Admin List */}
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase">
                      <tr>
                          <th className="p-3">Email</th>
                          <th className="p-3">Rôle</th>
                          <th className="p-3">Ajouté par</th>
                          <th className="p-3">Dernière activité</th>
                          <th className="p-3">Actions</th>
                      </tr>
                  </thead>
                  <tbody>
                      {admins.map(admin => (
                          <tr key={admin.id} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="p-3 font-medium text-slate-800">{admin.email}</td>
                              <td className="p-3"><span className="bg-brand-gold/20 text-brand-dark px-2 py-1 rounded-full text-xs font-bold">{admin.role}</span></td>
                              <td className="p-3 text-slate-500">{admin.addedBy}</td>
                              <td className="p-3 text-slate-500">{admin.lastActive}</td>
                              <td className="p-3">
                                  {admin.role !== AdminRole.SUPER_ADMIN && (
                                      <button className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>
                                  )}
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      )}

      {/* --- VOICE AI TAB --- */}
      {activeTab === 'VOICE_AI' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in">
              {/* Cloning Studio */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-brand-dark">
                      <Mic size={20} className="text-purple-500"/> Studio Clonage Vocal
                  </h3>
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-center bg-slate-50 mb-6">
                      <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-all ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-200'}`}>
                          <Mic size={32} className={isRecording ? 'text-white' : 'text-slate-400'} />
                      </div>
                      <h4 className="font-bold text-slate-800 mb-2">{isRecording ? "Enregistrement..." : "Enregistrer une voix"}</h4>
                      <p className="text-sm text-slate-500 mb-4">Lisez un texte de 30 secondes pour cloner votre voix.</p>
                      <button 
                        onClick={handleRecordVoice}
                        className={`px-6 py-2 rounded-full font-bold text-white transition-colors ${isRecording ? 'bg-red-600' : 'bg-brand-dark hover:bg-slate-800'}`}
                      >
                          {isRecording ? "Arrêter & Sauvegarder" : "Démarrer Enregistrement"}
                      </button>
                  </div>
                  
                  <div className="space-y-2">
                      <h4 className="font-bold text-sm text-slate-700">Modèles Vocaux Disponibles</h4>
                      {voiceModels.map(voice => (
                          <div key={voice.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg hover:shadow-sm">
                              <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${voice.source === 'CLONED' ? 'bg-purple-500' : 'bg-slate-400'}`}>
                                      {voice.source === 'CLONED' ? 'C' : 'P'}
                                  </div>
                                  <div>
                                      <div className="font-bold text-sm">{voice.name}</div>
                                      <div className="text-xs text-slate-400">{voice.assignedTo ? `Assigné à ${voice.assignedTo}` : 'Non assigné'}</div>
                                  </div>
                              </div>
                              <select 
                                value={voice.assignedTo || ''} 
                                onChange={(e) => handleAssignVoice(voice.id, e.target.value as ExpertType)}
                                className="text-xs border border-slate-200 rounded p-1 bg-slate-50"
                              >
                                  <option value="">Assigner à...</option>
                                  {Experts.map(exp => <option key={exp.id} value={exp.id}>{exp.name}</option>)}
                              </select>
                          </div>
                      ))}
                  </div>
              </div>

              {/* Agent Prompt Management */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-brand-dark">
                      <Settings size={20} className="text-brand-gold"/> Configuration Agents IA
                  </h3>
                  <div className="mb-4">
                      <label className="block text-sm font-bold text-slate-700 mb-2">Sélectionner l'Expert</label>
                      <div className="flex flex-wrap gap-2">
                          {Experts.map(exp => (
                              <button 
                                key={exp.id} 
                                onClick={() => setSelectedAgent(exp.id)}
                                className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${selectedAgent === exp.id ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                              >
                                  {exp.name}
                              </button>
                          ))}
                      </div>
                  </div>
                  
                  <div className="mb-4">
                      <label className="block text-sm font-bold text-slate-700 mb-2">Instructions Système (Prompt)</label>
                      <textarea 
                          value={agentPrompt}
                          onChange={(e) => setAgentPrompt(e.target.value)}
                          className="w-full h-64 p-4 border border-slate-200 rounded-xl bg-slate-50 text-sm font-mono text-slate-700 outline-none focus:border-brand-accent resize-none"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                          La politique de langue (réponse dans la langue de l'interlocuteur) est ajoutée automatiquement à ces instructions et ne peut pas être supprimée.
                      </p>
                  </div>
                  
                  <div className="flex justify-end gap-3">
                      <button 
                        onClick={() => {
                            resetSystemInstruction(selectedAgent);
                            alert("Réinitialisé !");
                        }} 
                        className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm font-bold flex items-center gap-2"
                      >
                          <RotateCcw size={16} /> Par Défaut
                      </button>
                      <button 
                        onClick={handleSavePrompt} 
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-green-700"
                      >
                          <Save size={16} /> Sauvegarder
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- SUBSCRIPTIONS TAB --- */}
      {activeTab === 'SUBSCRIPTIONS' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in">
              <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-brand-dark">
                  <CreditCard size={20} className="text-brand-gold"/> Gestion Abonnements & Crédits
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div className="text-sm text-slate-500 font-bold mb-1">Abonnés Premium</div>
                      <div className="text-2xl font-bold text-brand-dark">24,500</div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div className="text-sm text-slate-500 font-bold mb-1">Crédits en Circulation</div>
                      <div className="text-2xl font-bold text-blue-600">8.2M</div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div className="text-sm text-slate-500 font-bold mb-1">Revenu Mensuel (Est.)</div>
                      <div className="text-2xl font-bold text-green-600">125,000 €</div>
                  </div>
              </div>

              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase">
                      <tr>
                          <th className="p-3">Utilisateur</th>
                          <th className="p-3">Plan Actuel</th>
                          <th className="p-3">Solde Crédits</th>
                          <th className="p-3">Expiration</th>
                          <th className="p-3">Actions</th>
                      </tr>
                  </thead>
                  <tbody>
                      {/* Mock Users */}
                      <tr className="border-b border-slate-100">
                          <td className="p-3 font-bold">aminata.diallo@email.com</td>
                          <td className="p-3"><span className="bg-brand-gold text-brand-dark px-2 py-1 rounded text-xs font-bold">PREMIUM</span></td>
                          <td className="p-3">450 pts</td>
                          <td className="p-3">12 Déc 2025</td>
                          <td className="p-3 flex gap-2">
                              <button className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-xs font-bold hover:bg-blue-100">+ Crédits</button>
                              <button className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold hover:bg-slate-200">Gérer</button>
                          </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                          <td className="p-3 font-bold">jean.kone@email.com</td>
                          <td className="p-3"><span className="bg-slate-200 text-slate-600 px-2 py-1 rounded text-xs font-bold">GRATUIT</span></td>
                          <td className="p-3">10 pts</td>
                          <td className="p-3">-</td>
                          <td className="p-3 flex gap-2">
                              <button className="bg-green-50 text-green-600 px-2 py-1 rounded text-xs font-bold hover:bg-green-100">Offrir Premium</button>
                          </td>
                      </tr>
                  </tbody>
              </table>
          </div>
      )}
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: any) => (
    <button 
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            active ? 'bg-brand-dark text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
    >
        {icon} {label}
    </button>
);

const StatCard = ({ title, value, trend, icon, color }: any) => (
  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
    <div className={`w-12 h-12 rounded-lg ${color} flex items-center justify-center shadow-md`}>
      {icon}
    </div>
    <div>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-wide">{title}</p>
      <div className="flex items-end gap-2">
        <h2 className="text-2xl font-bold text-slate-800">{value}</h2>
        <span className="text-xs text-green-600 font-bold mb-1 bg-green-50 px-1 rounded">{trend}</span>
      </div>
    </div>
  </div>
);

const UsageBar = ({ name, count, color }: any) => (
  <div>
    <div className="flex justify-between text-sm mb-1">
      <span className="font-medium text-slate-700">{name}</span>
      <span className="text-slate-500 font-bold">{count}</span>
    </div>
    <div className="w-full bg-slate-100 rounded-full h-2.5">
      <div className={`h-2.5 rounded-full ${color}`} style={{ width: count }}></div>
    </div>
  </div>
);

const SystemStatus = ({ name, status, ping, color = 'text-green-500' }: any) => (
    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
        <span className="font-medium text-slate-700">{name}</span>
        <div className="flex items-center gap-3">
            <span className={`text-xs font-bold ${color}`}>{status}</span>
            <span className="text-xs text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">{ping}</span>
        </div>
    </div>
);
