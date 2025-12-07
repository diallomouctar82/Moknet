
import React, { useState, useEffect, useRef } from 'react';
import { SocialPost, LiveStream, ExpertType, UserProfile, Experience, Language, MokBadge } from '../types';
import { generateVeoVideo, generateImage, generateProfileBio, enhanceExperienceDescription } from '../services/geminiService';
import { Heart, MessageCircle, Share2, Video, Image as ImageIcon, Sparkles, Loader2, Play, Radio, User, MapPin, Award, Briefcase, Zap, Edit2, Globe, GraduationCap, Building2, Wand2, X, Plus, Save, Mic, Camera, Filter, ArrowDownUp } from 'lucide-react';

const LIVE_CHANNELS: LiveStream[] = [
    { id: 'l1', title: 'Droits des Locataires', host: 'Maître Diallo', expertType: ExpertType.MAITRE, category: 'JURIDIQUE', viewers: 1240, thumbnailColor: 'bg-red-800' },
    { id: 'l2', title: 'Créer sa boîte', host: 'Conseiller Diallo', expertType: ExpertType.CONSEILLER, category: 'BUSINESS', viewers: 856, thumbnailColor: 'bg-purple-800' },
    { id: 'l3', title: 'Urgences Santé', host: 'Dr. Diallo', expertType: ExpertType.DOCTEUR, category: 'SANTÉ', viewers: 3402, thumbnailColor: 'bg-green-800' },
    { id: 'l4', title: 'Apprendre l\'Anglais', host: 'Diallo', expertType: ExpertType.DIALLO, category: 'ÉDUCATION', viewers: 512, thumbnailColor: 'bg-blue-800' },
];

const MOCK_POSTS: SocialPost[] = [
  { id: '1', user: 'Aminata K.', content: 'Fidèle au poste pour le live de Maître Diallo ce matin ! Le droit du travail expliqué simplement, ça change tout. 🌍', likes: 1240 },
  { id: '2', user: 'Jean-Pierre M.', content: 'Voici ma dernière création en menuiserie grâce aux cours MOK. Qu\'en pensez-vous ?', likes: 856, imageUrl: 'https://images.unsplash.com/photo-1629023778000-84c6c06b2c86?auto=format&fit=crop&q=80&w=800' },
];

const MOCK_PROFILE: UserProfile = {
    id: 'u1',
    name: 'Utilisateur',
    title: 'Entrepreneur & Étudiant MOK',
    location: 'Dakar, Sénégal',
    avatar: 'U',
    skills: ['Gestion de projet', 'Menuiserie', 'Marketing Digital'],
    interests: ['Innovation Frugale', 'Énergies Renouvelables', 'Startups'],
    mokBadges: [
        { id: 'b1', name: 'Certificat Menuiserie Niv.1', icon: '🪑', date: 'Oct 2024', level: 'Novice', faculty: 'MÉTIERS' },
        { id: 'b2', name: 'Business Model Canvas', icon: '📊', date: 'Nov 2024', level: 'Intermédiaire', faculty: 'BUSINESS' }
    ],
    aiSummary: '',
    languages: [
        { name: 'Français', level: 'Natif' },
        { name: 'Wolof', level: 'Natif' },
        { name: 'Anglais', level: 'Intermédiaire' }
    ],
    education: [
        { id: 'e1', school: 'Université Virtuelle MOK', degree: 'Diplôme Professionnel - Menuiserie', year: '2024' },
        { id: 'e2', school: 'Lycée Thierno Seydou', degree: 'Baccalauréat Scientifique', year: '2019' }
    ],
    experience: [
        { id: 'ex1', company: 'Atelier Moderne Dakar', role: 'Apprenti Menuisier', duration: '6 mois', description: 'Assistance à la conception de meubles et gestion des stocks.' },
        { id: 'ex2', company: 'Freelance', role: 'Community Manager', duration: '1 an', description: 'Gestion des réseaux sociaux pour petites entreprises locales.' }
    ],
    subscription: {
        plan: 'FREE',
        credits: 10,
        isActive: true
    }
};

const EXPERTS_LIST = [
    { type: ExpertType.DIALLO, name: 'Diallo', role: 'Communication', color: 'bg-blue-600', desc: "Idéal pour l'animation et les langues." },
    { type: ExpertType.MAITRE, name: 'Maître Diallo', role: 'Justice & Droit', color: 'bg-red-700', desc: "Pour les débats juridiques et administratifs." },
    { type: ExpertType.DOCTEUR, name: 'Dr. Diallo', role: 'Santé & Bien-être', color: 'bg-green-600', desc: "Conseils santé, prévention et bien-être." },
    { type: ExpertType.PROFESSEUR, name: 'Prof. Diallo', role: 'Éducation', color: 'bg-yellow-600', desc: "Pédagogie, cours en direct, orientation." },
    { type: ExpertType.CONSEILLER, name: 'Conseiller Diallo', role: 'Emploi & Business', color: 'bg-purple-600', desc: "Entrepreneuriat, carrière, coaching." },
    { type: ExpertType.MONSIEUR, name: 'M. Diallo', role: 'Logement', color: 'bg-orange-600', desc: "Immobilier, aides au logement, travaux." },
    { type: ExpertType.GUIDE, name: 'Guide Diallo', role: 'Voyage', color: 'bg-sky-500', desc: "Tourisme, culture, immigration." },
];

export const SocialFeed: React.FC = () => {
  const [posts, setPosts] = useState<SocialPost[]>(MOCK_POSTS);
  const [newPostContent, setNewPostContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedMedia, setGeneratedMedia] = useState<{type: 'video' | 'image', url: string} | null>(null);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [mediaMode, setMediaMode] = useState<'none' | 'veo' | 'image'>('none');
  const [activeLive, setActiveLive] = useState<LiveStream | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  
  // Live Filtering & Sorting
  const [liveCategoryFilter, setLiveCategoryFilter] = useState<string>('TOUT');
  const [liveSort, setLiveSort] = useState<'POPULAR' | 'NEW'>('POPULAR');
  
  // Live Creation State
  const [isCreatingLive, setIsCreatingLive] = useState(false);
  const [liveConfig, setLiveConfig] = useState({ title: '', category: 'DIVERS', coHost: null as ExpertType | null });
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [userLiveStream, setUserLiveStream] = useState<LiveStream | null>(null);

  // Profile State with Migration Logic
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
      const saved = localStorage.getItem('mok_user_profile');
      if (saved) {
          try {
              const parsed = JSON.parse(saved);
              if (parsed.languages && parsed.languages.length > 0 && typeof parsed.languages[0] === 'string') {
                  parsed.languages = parsed.languages.map((l: string) => ({ name: l, level: 'Intermédiaire' }));
              }
              if (!parsed.subscription) {
                  parsed.subscription = { plan: 'FREE', credits: 10, isActive: true };
              }
              return parsed;
          } catch (e) {
              return MOCK_PROFILE;
          }
      }
      return MOCK_PROFILE;
  });

  const [isEditing, setIsEditing] = useState(false);
  const [tempInput, setTempInput] = useState({ 
      skill: '', 
      interest: '', 
      languageName: '', 
      languageLevel: 'Intermédiaire',
      badgeName: '',
      badgeIcon: '🏆',
      badgeLevel: 'Novice' as 'Novice' | 'Intermédiaire' | 'Expert',
      badgeFaculty: 'MÉTIERS'
  });

  const [isGeneratingBio, setIsGeneratingBio] = useState(false);
  const [isEnhancingExp, setIsEnhancingExp] = useState<string | null>(null);

  useEffect(() => {
      localStorage.setItem('mok_user_profile', JSON.stringify(userProfile));
  }, [userProfile]);

  const handleGenerate = async () => {
    if (!generationPrompt) return;
    setIsGenerating(true);
    setGeneratedMedia(null);

    try {
        if (mediaMode === 'veo') {
            const url = await generateVeoVideo(generationPrompt, '9:16'); // Hardcoded for Shorts/TikTok style
            setGeneratedMedia({ type: 'video', url });
        } else if (mediaMode === 'image') {
            const url = await generateImage(generationPrompt, '1K');
            setGeneratedMedia({ type: 'image', url });
        }
    } catch (e) {
        alert("Erreur lors de la génération. Veuillez vérifier que votre clé API est configurée pour Veo/Imagen.");
    } finally {
        setIsGenerating(false);
    }
  };

  const handlePost = () => {
    if (!newPostContent && !generatedMedia) return;
    const post: SocialPost = {
        id: Date.now().toString(),
        user: 'Moi',
        content: newPostContent,
        likes: 0,
        imageUrl: generatedMedia?.type === 'image' ? generatedMedia.url : undefined,
        videoUrl: generatedMedia?.type === 'video' ? generatedMedia.url : undefined
    };
    setPosts([post, ...posts]);
    setNewPostContent('');
    setGeneratedMedia(null);
    setGenerationPrompt('');
    setMediaMode('none');
  };

  const handleGenerateBio = async () => {
      setIsGeneratingBio(true);
      try {
          const bio = await generateProfileBio(userProfile);
          setUserProfile(prev => ({ ...prev, aiSummary: bio }));
      } catch (e) {
          console.error(e);
      } finally {
          setIsGeneratingBio(false);
      }
  };

  const handleEnhanceExperience = async (expId: string) => {
    const exp = userProfile.experience.find(e => e.id === expId);
    if (!exp) return;

    setIsEnhancingExp(expId);
    try {
        const enhancedDesc = await enhanceExperienceDescription(exp.role, exp.company, exp.description);
        if (enhancedDesc) {
            setUserProfile(prev => ({
                ...prev,
                experience: prev.experience.map(e => e.id === expId ? { ...e, description: enhancedDesc } : e)
            }));
        }
    } catch (e) {
        console.error(e);
    } finally {
        setIsEnhancingExp(null);
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            setUserProfile(prev => ({ ...prev, avatar: reader.result as string }));
        };
        reader.readAsDataURL(file);
    }
  };

  const renderUserAvatar = (uName: string, size: string = "w-10 h-10") => {
      const isMe = uName === 'Moi' || uName === userProfile.name;
      const avatarSrc = isMe ? userProfile.avatar : undefined;
      
      if (avatarSrc && (avatarSrc.startsWith('data:') || avatarSrc.startsWith('http'))) {
          return <img src={avatarSrc} alt={uName} className={`${size} rounded-full object-cover shadow-sm border border-slate-100`} />;
      }
      
      const initial = isMe ? (avatarSrc || uName.charAt(0)) : uName.charAt(0);
      const bgClass = isMe ? 'bg-brand-gold text-brand-dark' : 'bg-slate-400 text-white';
      
      return (
        <div className={`${size} rounded-full flex items-center justify-center font-bold ${bgClass} shadow-sm border border-white`}>
            {initial}
        </div>
      );
  }

  // Live Logic
  const startUserLive = () => {
      if (!liveConfig.title) return;
      const newLive: LiveStream = {
          id: 'user-live-' + Date.now(),
          title: liveConfig.title,
          host: userProfile.name,
          expertType: ExpertType.DIALLO, // Default
          category: liveConfig.category,
          viewers: 0,
          thumbnailColor: 'bg-brand-dark',
          isUserGenerated: true,
          coHost: liveConfig.coHost || undefined
      };
      setUserLiveStream(newLive);
      setIsCreatingLive(false);
      setIsBroadcasting(true);
      setActiveLive(newLive);
  };

  const stopUserLive = () => {
      setIsBroadcasting(false);
      setUserLiveStream(null);
      setActiveLive(null);
  };

  // Filter & Sort Logic for Lives
  const getFilteredLives = () => {
      let lives = [...LIVE_CHANNELS, ...(userLiveStream ? [userLiveStream] : [])];
      
      if (liveCategoryFilter !== 'TOUT') {
          lives = lives.filter(l => l.category === liveCategoryFilter);
      }
      
      if (liveSort === 'POPULAR') {
          lives.sort((a, b) => b.viewers - a.viewers);
      } else {
          // Mock sorting by 'NEW' (just reverse for demo as IDs are somewhat chronological or random)
          lives.reverse();
      }
      return lives;
  };

  const filteredLives = getFilteredLives();

  // --- EDITING HANDLERS ---
  const handleAddItem = (field: 'skills' | 'interests' | 'languages' | 'mokBadges') => {
      if (field === 'languages') {
          if (!tempInput.languageName.trim()) return;
          setUserProfile(prev => ({
              ...prev,
              languages: [...prev.languages, { name: tempInput.languageName.trim(), level: tempInput.languageLevel }]
          }));
          setTempInput(prev => ({ ...prev, languageName: '', languageLevel: 'Intermédiaire' }));
          return;
      }

      if (field === 'mokBadges') {
          if (!tempInput.badgeName.trim()) return;
          const newBadge: MokBadge = {
              id: Date.now().toString(),
              name: tempInput.badgeName.trim(),
              icon: tempInput.badgeIcon,
              level: tempInput.badgeLevel,
              faculty: tempInput.badgeFaculty,
              date: new Date().toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
          };
          setUserProfile(prev => ({
              ...prev,
              mokBadges: [...prev.mokBadges, newBadge]
          }));
          setTempInput(prev => ({ ...prev, badgeName: '', badgeIcon: '🏆' }));
          return;
      }
      
      const key = field === 'skills' ? 'skill' : 'interest';
      const value = (tempInput as any)[key];
      if (!value.trim()) return;
      
      setUserProfile(prev => ({
          ...prev,
          [field]: [...prev[field], value.trim()]
      }));
      setTempInput(prev => ({ ...prev, [key]: '' }));
  };

  const handleRemoveItem = (field: 'skills' | 'interests' | 'languages' | 'mokBadges', index: number) => {
      setUserProfile(prev => ({
          ...prev,
          [field]: prev[field].filter((_, i) => i !== index)
      }));
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: 'skills' | 'interests' | 'languages') => {
      if (e.key === 'Enter') {
          handleAddItem(field);
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 overflow-y-auto relative">
      
      {/* 24/7 LIVE TV BAR */}
      <div className="bg-brand-dark text-white pt-6 pb-4 px-4 shadow-lg sticky top-0 z-20">
        <div className="flex flex-col gap-3 mb-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Radio className="text-red-500 animate-pulse" size={18} />
                    <h2 className="font-bold text-sm tracking-wider">EN DIRECT MAINTENANT</h2>
                </div>
                <div className="flex gap-2">
                    {!isBroadcasting && (
                        <button 
                            onClick={() => setIsCreatingLive(true)}
                            className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-red-600 hover:bg-red-700 transition-colors shadow-lg shadow-red-900/50"
                        >
                            <Video size={14} /> Lancer un Live
                        </button>
                    )}
                    <button 
                        onClick={() => setShowProfile(!showProfile)}
                        className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-colors ${showProfile ? 'bg-brand-gold text-brand-dark' : 'bg-white/10 hover:bg-white/20'}`}
                    >
                        <User size={14} /> {showProfile ? 'Voir le Fil' : 'Mon Profil'}
                    </button>
                </div>
            </div>

            {/* Filter & Sort Controls */}
            {!showProfile && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                    <Filter size={14} className="text-slate-400 shrink-0" />
                    {['TOUT', 'JURIDIQUE', 'SANTÉ', 'BUSINESS', 'ÉDUCATION'].map(cat => (
                        <button 
                            key={cat}
                            onClick={() => setLiveCategoryFilter(cat)}
                            className={`px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap transition-colors ${liveCategoryFilter === cat ? 'bg-white text-brand-dark' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}
                        >
                            {cat}
                        </button>
                    ))}
                    <div className="w-px h-4 bg-white/20 mx-1"></div>
                    <button 
                         onClick={() => setLiveSort(liveSort === 'POPULAR' ? 'NEW' : 'POPULAR')}
                         className="flex items-center gap-1 text-[10px] text-slate-300 hover:text-white"
                    >
                        <ArrowDownUp size={12} /> {liveSort === 'POPULAR' ? 'Popularité' : 'Récents'}
                    </button>
                </div>
            )}
        </div>
        
        {!showProfile && (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {filteredLives.length > 0 ? filteredLives.map(live => (
                    <button 
                        key={live.id}
                        onClick={() => setActiveLive(live)}
                        className={`flex-shrink-0 relative w-48 h-28 rounded-xl overflow-hidden group border transition-all ${activeLive?.id === live.id ? 'border-brand-gold ring-2 ring-brand-gold' : 'border-white/10'}`}
                    >
                        <div className={`absolute inset-0 ${live.thumbnailColor} opacity-80 group-hover:opacity-100 transition-opacity`}></div>
                        <div className="absolute inset-0 flex flex-col justify-end p-3 bg-gradient-to-t from-black/90 to-transparent">
                            <div className="flex items-center gap-1 mb-1">
                                <span className="text-xs font-bold bg-red-600 text-white px-1.5 py-0.5 rounded w-fit flex items-center gap-1">
                                    LIVE {live.isUserGenerated && <User size={8} />}
                                </span>
                                {live.coHost && (
                                    <span className="text-[10px] font-bold bg-brand-gold text-brand-dark px-1.5 py-0.5 rounded w-fit flex items-center gap-1">
                                        +IA
                                    </span>
                                )}
                            </div>
                            <h3 className="text-sm font-bold leading-tight truncate text-left">{live.title}</h3>
                            <p className="text-[10px] text-slate-300 flex justify-between mt-1">
                                <span className="truncate pr-2">{live.host}</span>
                                <span className="flex items-center gap-1 shrink-0">👁️ {live.viewers}</span>
                            </p>
                        </div>
                        {/* Play Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                            <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                                <Play size={16} className="fill-white text-white ml-0.5"/>
                            </div>
                        </div>
                    </button>
                )) : (
                    <div className="text-white/50 text-sm p-4 w-full text-center italic">
                        Aucun live ne correspond aux filtres.
                    </div>
                )}
            </div>
        )}
      </div>

      {/* Live Creation Modal */}
      {isCreatingLive && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 shadow-2xl flex flex-col max-h-[90vh]">
                  <div className="bg-brand-dark p-4 flex justify-between items-center text-white shrink-0">
                      <h3 className="font-bold flex items-center gap-2"><Video size={18}/> Studio Live Créateur</h3>
                      <button onClick={() => setIsCreatingLive(false)} className="hover:bg-white/20 p-1 rounded-full"><X size={20}/></button>
                  </div>
                  <div className="p-6 overflow-y-auto">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                              <h4 className="font-bold text-slate-800 border-b pb-2">1. Configuration</h4>
                              <div>
                                  <label className="block text-sm font-bold text-slate-700 mb-1">Titre du Live</label>
                                  <input 
                                    value={liveConfig.title}
                                    onChange={e => setLiveConfig({...liveConfig, title: e.target.value})}
                                    className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-brand-accent transition-all"
                                    placeholder="Ex: Débat sur l'IA en Afrique..."
                                  />
                              </div>
                              <div>
                                  <label className="block text-sm font-bold text-slate-700 mb-1">Catégorie</label>
                                  <select 
                                    value={liveConfig.category}
                                    onChange={e => setLiveConfig({...liveConfig, category: e.target.value})}
                                    className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-brand-accent bg-white"
                                  >
                                      <option value="DIVERS">Divers</option>
                                      <option value="JURIDIQUE">Juridique</option>
                                      <option value="SANTÉ">Santé</option>
                                      <option value="BUSINESS">Business</option>
                                      <option value="ÉDUCATION">Éducation</option>
                                  </select>
                              </div>
                          </div>

                          <div className="space-y-4">
                              <h4 className="font-bold text-slate-800 border-b pb-2">2. Co-animateur IA (Expert Diallo)</h4>
                              <p className="text-xs text-slate-500 mb-2">Sélectionnez un expert pour animer le live avec vous.</p>
                              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                                  {EXPERTS_LIST.map(exp => (
                                      <button
                                        key={exp.type}
                                        onClick={() => setLiveConfig({...liveConfig, coHost: liveConfig.coHost === exp.type ? null : exp.type})}
                                        className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all ${
                                            liveConfig.coHost === exp.type 
                                            ? 'border-brand-gold bg-brand-gold/10 ring-1 ring-brand-gold' 
                                            : 'border-slate-100 hover:bg-slate-50'
                                        }`}
                                      >
                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${exp.color}`}>
                                              {exp.name.charAt(0)}
                                          </div>
                                          <div>
                                              <span className="text-xs font-bold block">{exp.name}</span>
                                              <span className="text-[9px] text-slate-500 leading-tight line-clamp-1">{exp.role}</span>
                                          </div>
                                      </button>
                                  ))}
                              </div>
                          </div>
                      </div>
                      
                      <div className="mt-6 pt-6 border-t border-slate-100">
                          <button 
                            onClick={startUserLive}
                            disabled={!liveConfig.title}
                            className="w-full py-4 bg-gradient-to-r from-red-600 to-red-700 text-white font-bold rounded-xl hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                          >
                              <Video size={20} /> Lancer le Direct Maintenant
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Broadcaster View */}
      {isBroadcasting && (
          <div className="fixed inset-0 z-40 bg-slate-900 flex flex-col animate-in fade-in duration-500">
              {/* Header Overlay */}
              <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/80 to-transparent">
                  <div className="flex items-center gap-3">
                      <div className="bg-red-600 px-3 py-1 rounded text-xs font-bold text-white animate-pulse flex items-center gap-2">
                          <div className="w-2 h-2 bg-white rounded-full"></div> EN DIRECT
                      </div>
                      <span className="text-white font-mono text-sm opacity-80">00:04:12</span>
                      <div className="bg-black/40 px-3 py-1 rounded-full text-xs text-white backdrop-blur-md border border-white/10 flex items-center gap-1">
                          👁️ 12 Spectateurs
                      </div>
                  </div>
                  <button onClick={stopUserLive} className="bg-white/10 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold backdrop-blur-md transition-colors border border-white/20">
                      Arrêter le flux
                  </button>
              </div>
              
              <div className="flex-1 flex flex-col md:flex-row h-full">
                  {/* Main Camera (Simulated) */}
                  <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden group">
                      {/* Fake Camera Feed */}
                      <img 
                        src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=800" 
                        className="absolute inset-0 w-full h-full object-cover opacity-60"
                        alt="Camera Feed"
                      />
                      <div className="relative z-10 flex flex-col items-center">
                          <div className="w-20 h-20 rounded-full border-2 border-white/30 flex items-center justify-center mb-4">
                              <Camera size={32} className="text-white/50"/>
                          </div>
                          <span className="text-white/50 text-sm">Votre caméra est active</span>
                      </div>
                      
                      {/* Stream Info Overlay */}
                      <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/90 to-transparent">
                          <h2 className="text-white font-bold text-2xl">{liveConfig.title}</h2>
                          <p className="text-brand-gold text-sm font-medium">{userProfile.name} • {liveConfig.category}</p>
                      </div>
                  </div>
                  
                  {/* Co-Host Panel */}
                  {liveConfig.coHost && (
                      <div className="h-64 md:h-full md:w-80 bg-slate-800 border-l border-white/10 flex flex-col relative shrink-0">
                          <div className="p-4 border-b border-white/10 bg-slate-900/50 backdrop-blur-md flex items-center justify-between">
                              <span className="text-xs font-bold text-brand-gold uppercase tracking-wider">Co-animateur IA</span>
                              <div className="flex gap-1">
                                  <div className="w-1 h-4 bg-green-500 rounded-full animate-pulse"></div>
                                  <div className="w-1 h-4 bg-green-500 rounded-full animate-pulse delay-75"></div>
                                  <div className="w-1 h-4 bg-green-500 rounded-full animate-pulse delay-150"></div>
                              </div>
                          </div>
                          
                          <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
                              {/* Background Glow */}
                              <div className={`absolute inset-0 opacity-20 blur-3xl ${EXPERTS_LIST.find(e => e.type === liveConfig.coHost)?.color}`}></div>
                              
                              {/* Avatar */}
                              <div className={`w-32 h-32 rounded-full flex items-center justify-center text-5xl mb-6 shadow-2xl border-4 border-white/10 relative z-10 ${EXPERTS_LIST.find(e => e.type === liveConfig.coHost)?.color}`}>
                                  <div className="absolute inset-0 rounded-full border-4 border-white opacity-20 animate-ping"></div>
                                  {EXPERTS_LIST.find(e => e.type === liveConfig.coHost)?.name.charAt(0)}
                              </div>
                              
                              <h3 className="text-white font-bold text-xl relative z-10">{EXPERTS_LIST.find(e => e.type === liveConfig.coHost)?.name}</h3>
                              <p className="text-white/60 text-sm text-center mt-2 relative z-10">
                                  {EXPERTS_LIST.find(e => e.type === liveConfig.coHost)?.role}
                              </p>
                              
                              <div className="mt-8 w-full bg-black/20 p-4 rounded-xl border border-white/5 relative z-10">
                                  <p className="text-white/80 text-sm italic text-center">
                                      "Je suis prêt à répondre aux questions juridiques de vos spectateurs."
                                  </p>
                              </div>
                          </div>
                          
                          {/* Chat Simulation */}
                          <div className="h-1/3 border-t border-white/10 bg-black/20 p-4 overflow-y-auto">
                              <div className="text-xs font-bold text-slate-400 mb-2 uppercase">Chat du Live</div>
                              <div className="space-y-2">
                                  <div className="text-xs text-white"><span className="text-brand-gold font-bold">Moussa:</span> Bonjour Maître !</div>
                                  <div className="text-xs text-white"><span className="text-blue-400 font-bold">Sophie:</span> Super sujet.</div>
                                  <div className="text-xs text-white"><span className="text-green-400 font-bold">Jean:</span> Le son est top.</div>
                              </div>
                          </div>
                      </div>
                  )}
              </div>
          </div>
      )}

      {showProfile ? (
          // --- PROFILE VIEW ---
          <div className="max-w-2xl mx-auto w-full p-4 space-y-6">
              
              {/* Header Card */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-brand-dark to-slate-800"></div>
                  <div className="relative mt-8 flex flex-col md:flex-row items-start md:items-end gap-4">
                      <div className="relative group cursor-pointer w-24 h-24 shrink-0">
                        {renderUserAvatar(userProfile.name, "w-24 h-24 text-4xl")}
                        <input type="file" accept="image/*" onChange={handleAvatarUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                        <div className="absolute inset-0 bg-black/30 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity pointer-events-none z-20">
                            <Edit2 size={20} />
                        </div>
                      </div>

                      <div className="flex-1 mb-2 w-full">
                          {isEditing ? (
                              <div className="space-y-3">
                                  <input 
                                    className="text-2xl font-bold text-slate-900 border-b-2 border-brand-gold bg-transparent outline-none w-full placeholder-slate-300" 
                                    value={userProfile.name} 
                                    onChange={e => setUserProfile({...userProfile, name: e.target.value})} 
                                    placeholder="Votre nom"
                                  />
                                  <input 
                                    className="text-slate-600 font-medium border-b border-slate-300 bg-transparent outline-none w-full placeholder-slate-300" 
                                    value={userProfile.title} 
                                    onChange={e => setUserProfile({...userProfile, title: e.target.value})} 
                                    placeholder="Votre titre professionnel"
                                  />
                                  <div className="flex items-center gap-2 text-slate-500">
                                      <MapPin size={16} />
                                      <input 
                                        className="border-b border-slate-300 bg-transparent outline-none w-full text-sm placeholder-slate-300" 
                                        value={userProfile.location} 
                                        onChange={e => setUserProfile({...userProfile, location: e.target.value})} 
                                        placeholder="Votre ville"
                                      />
                                  </div>
                              </div>
                          ) : (
                              <>
                                <h2 className="text-2xl font-bold text-slate-900">{userProfile.name}</h2>
                                <p className="text-slate-500 font-medium">{userProfile.title}</p>
                                <div className="flex items-center gap-1 text-slate-400 text-sm mt-1">
                                    <MapPin size={14} /> {userProfile.location}
                                </div>
                              </>
                          )}
                      </div>
                      <button 
                        onClick={() => setIsEditing(!isEditing)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${isEditing ? 'bg-green-600 text-white shadow-md' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                      >
                          {isEditing ? <><Save size={14} /> Sauvegarder</> : <><Edit2 size={14} /> Éditer Profil</>}
                      </button>
                  </div>
              </div>

              {/* AI Bio Section */}
              <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl p-6 shadow-sm border border-indigo-100">
                  <div className="flex justify-between items-center mb-3">
                      <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                          <Sparkles size={18} className="text-indigo-500" /> Résumé Professionnel IA
                      </h3>
                      <button 
                        onClick={handleGenerateBio} 
                        disabled={isGeneratingBio}
                        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-full font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                          {isGeneratingBio ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                          Générer avec Gemini
                      </button>
                  </div>
                  {isEditing ? (
                      <textarea
                          className="w-full p-4 rounded-xl border border-indigo-200 bg-white text-sm text-slate-700 leading-relaxed outline-none focus:border-indigo-400 min-h-[100px]"
                          value={userProfile.aiSummary}
                          onChange={(e) => setUserProfile({...userProfile, aiSummary: e.target.value})}
                          placeholder="Votre résumé professionnel généré par l'IA..."
                      />
                  ) : (
                      userProfile.aiSummary ? (
                          <p className="text-slate-700 italic leading-relaxed text-sm bg-white/60 p-4 rounded-xl border border-indigo-50">
                              "{userProfile.aiSummary}"
                          </p>
                      ) : (
                          <div className="text-center py-6 text-slate-400 text-sm border-2 border-dashed border-indigo-100 rounded-xl bg-white/50">
                              Cliquez sur "Générer" pour laisser Conseiller Diallo rédiger votre bio.
                          </div>
                      )
                  )}
              </div>

              {/* Skills & Interests */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Skills */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative">
                      <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                          <Briefcase size={18} className="text-blue-500" /> Compétences
                      </h3>
                      <div className="flex flex-wrap gap-2">
                          {userProfile.skills.map((skill, i) => (
                              <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-100 flex items-center gap-1 group">
                                  {skill}
                                  {isEditing && (
                                      <button onClick={() => handleRemoveItem('skills', i)} className="hover:text-red-500">
                                          <X size={12} />
                                      </button>
                                  )}
                              </span>
                          ))}
                          {isEditing && (
                            <div className="flex items-center gap-1 w-full mt-2">
                                <input 
                                    value={tempInput.skill}
                                    onChange={e => setTempInput({...tempInput, skill: e.target.value})}
                                    onKeyDown={e => handleKeyDown(e, 'skills')}
                                    placeholder="Ajouter une compétence..."
                                    className="flex-1 text-xs px-3 py-1.5 border rounded-lg outline-none focus:border-blue-400"
                                />
                                <button onClick={() => handleAddItem('skills')} className="p-1 bg-blue-500 text-white rounded-md hover:bg-blue-600">
                                    <Plus size={14} />
                                </button>
                            </div>
                          )}
                      </div>
                  </div>

                  {/* Interests */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                      <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                          <Heart size={18} className="text-red-500" /> Centres d'intérêt
                      </h3>
                      <div className="flex flex-wrap gap-2">
                          {userProfile.interests.map((interest, i) => (
                              <span key={i} className="px-3 py-1 bg-red-50 text-red-700 rounded-lg text-xs font-bold border border-red-100 flex items-center gap-1">
                                  {interest}
                                  {isEditing && (
                                      <button onClick={() => handleRemoveItem('interests', i)} className="hover:text-red-500">
                                          <X size={12} />
                                      </button>
                                  )}
                              </span>
                          ))}
                          {isEditing && (
                            <div className="flex items-center gap-1 w-full mt-2">
                                <input 
                                    value={tempInput.interest}
                                    onChange={e => setTempInput({...tempInput, interest: e.target.value})}
                                    onKeyDown={e => handleKeyDown(e, 'interests')}
                                    placeholder="Ajouter un intérêt..."
                                    className="flex-1 text-xs px-3 py-1.5 border rounded-lg outline-none focus:border-red-400"
                                />
                                <button onClick={() => handleAddItem('interests')} className="p-1 bg-red-500 text-white rounded-md hover:bg-red-600">
                                    <Plus size={14} />
                                </button>
                            </div>
                          )}
                      </div>
                  </div>
              </div>

              {/* MOK Achievements Grid */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <Award className="text-brand-gold" /> Réalisations Écoles MOK
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {userProfile.mokBadges.map((badge, i) => (
                          <div key={badge.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer group relative">
                              <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center text-2xl group-hover:scale-110 transition-transform shadow-sm">
                                  {badge.icon}
                              </div>
                              <div>
                                  <div className="font-bold text-slate-800 text-sm">{badge.name}</div>
                                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                      <span className="bg-brand-gold/20 text-brand-dark px-1.5 py-0.5 rounded">{badge.level}</span>
                                      <span>{badge.date}</span>
                                  </div>
                              </div>
                              {isEditing && (
                                  <button onClick={() => handleRemoveItem('mokBadges', i)} className="absolute top-2 right-2 text-slate-400 hover:text-red-500">
                                      <X size={14} />
                                  </button>
                              )}
                          </div>
                      ))}
                      
                      {isEditing ? (
                           <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col gap-2">
                               <div className="flex gap-2">
                                  <select 
                                      value={tempInput.badgeIcon}
                                      onChange={e => setTempInput({...tempInput, badgeIcon: e.target.value})}
                                      className="w-16 text-xl p-1.5 border rounded-lg outline-none bg-white text-center"
                                  >
                                      <option value="🏆">🏆</option>
                                      <option value="🥇">🥇</option>
                                      <option value="🥈">🥈</option>
                                      <option value="🥉">🥉</option>
                                      <option value="🎓">🎓</option>
                                      <option value="⭐">⭐</option>
                                      <option value="📜">📜</option>
                                      <option value="🚀">🚀</option>
                                      <option value="🪑">🪑</option>
                                      <option value="📊">📊</option>
                                      <option value="🌾">🌾</option>
                                  </select>
                                  <input 
                                      value={tempInput.badgeName}
                                      onChange={e => setTempInput({...tempInput, badgeName: e.target.value})}
                                      placeholder="Nom du certificat..."
                                      className="flex-1 text-xs px-3 py-1.5 border rounded-lg outline-none"
                                  />
                               </div>
                               <div className="flex gap-2">
                                  <select 
                                      value={tempInput.badgeLevel}
                                      onChange={e => setTempInput({...tempInput, badgeLevel: e.target.value as any})}
                                      className="flex-1 text-xs p-1.5 border rounded-lg outline-none bg-white"
                                  >
                                      <option value="Novice">Novice</option>
                                      <option value="Intermédiaire">Intermédiaire</option>
                                      <option value="Expert">Expert</option>
                                  </select>
                                  <select 
                                      value={tempInput.badgeFaculty}
                                      onChange={e => setTempInput({...tempInput, badgeFaculty: e.target.value})}
                                      className="flex-1 text-xs p-1.5 border rounded-lg outline-none bg-white"
                                  >
                                      <option value="MÉTIERS">MÉTIERS</option>
                                      <option value="AGRICULTURE">AGRICULTURE</option>
                                      <option value="BUSINESS">BUSINESS</option>
                                      <option value="SANTÉ">SANTÉ</option>
                                      <option value="TECH">TECH</option>
                                  </select>
                                  <button onClick={() => handleAddItem('mokBadges')} className="p-1.5 bg-brand-gold text-brand-dark rounded-md hover:bg-yellow-500 font-bold">
                                      <Plus size={16} />
                                  </button>
                               </div>
                           </div>
                      ) : (
                          <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center p-4 text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer text-center">
                              <Award size={24} className="mb-2 opacity-50"/>
                              <span className="text-xs font-medium">Continuer d'apprendre</span>
                          </div>
                      )}
                  </div>
              </div>

              {/* Professional Experience */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <Building2 className="text-brand-dark" size={20} /> Expérience Professionnelle
                  </h3>
                  <div className="space-y-6">
                      {userProfile.experience.map((exp) => (
                          <div key={exp.id} className="border-l-2 border-slate-200 pl-4 relative group">
                              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-200 border-2 border-white"></div>
                              <div className="flex justify-between items-start">
                                  <div>
                                      <h4 className="font-bold text-slate-900">{exp.role}</h4>
                                      <div className="text-sm text-slate-500 font-medium">{exp.company} • {exp.duration}</div>
                                  </div>
                                  <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleEnhanceExperience(exp.id)}
                                        disabled={isEnhancingExp === exp.id}
                                        className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md hover:bg-indigo-100 transition-colors flex items-center gap-1"
                                        title="Améliorer avec l'IA"
                                    >
                                        {isEnhancingExp === exp.id ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                                        Améliorer
                                    </button>
                                    {isEditing && (
                                        <button className="text-xs text-red-400 hover:text-red-600">Supprimer</button>
                                    )}
                                  </div>
                              </div>
                              <p className="mt-2 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                                  {exp.description}
                              </p>
                          </div>
                      ))}
                      {isEditing && (
                         <button className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
                             <Plus size={16} /> Ajouter une expérience
                         </button>
                      )}
                  </div>
              </div>

               {/* Education History */}
               <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <GraduationCap className="text-brand-dark" size={20} /> Parcours Académique
                  </h3>
                  <div className="space-y-4">
                      {userProfile.education.map((edu) => (
                          <div key={edu.id} className="flex items-start gap-4">
                              <div className="w-10 h-10 bg-brand-gold/20 rounded-lg flex items-center justify-center text-brand-dark font-bold shrink-0">
                                  <GraduationCap size={18} />
                              </div>
                              <div className="flex-1">
                                  <h4 className="font-bold text-slate-900 text-sm">{edu.school}</h4>
                                  <p className="text-sm text-slate-600">{edu.degree}</p>
                                  <p className="text-xs text-slate-400 mt-0.5">{edu.year}</p>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              {/* Languages */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <Globe className="text-green-600" size={18} /> Langues Parlées
                  </h3>
                  <div className="flex flex-wrap gap-2">
                      {userProfile.languages.map((lang, i) => (
                          <span key={i} className="px-3 py-1.5 bg-green-50 text-green-800 rounded-lg text-sm font-medium border border-green-100 flex items-center gap-1">
                              {lang.name} <span className="text-xs opacity-75">({lang.level})</span>
                              {isEditing && (
                                  <button onClick={() => handleRemoveItem('languages', i)} className="hover:text-red-500 ml-1">
                                      <X size={12} />
                                  </button>
                              )}
                          </span>
                      ))}
                      {isEditing && (
                        <div className="flex items-center gap-1 mt-2 w-full sm:w-auto">
                            <input 
                                value={tempInput.languageName}
                                onChange={e => setTempInput({...tempInput, languageName: e.target.value})}
                                onKeyDown={e => handleKeyDown(e, 'languages')}
                                placeholder="Langue..."
                                className="text-xs px-3 py-1.5 border rounded-lg outline-none focus:border-green-400 w-32"
                            />
                            <select 
                                value={tempInput.languageLevel}
                                onChange={e => setTempInput({...tempInput, languageLevel: e.target.value})}
                                className="text-xs px-2 py-1.5 border rounded-lg outline-none focus:border-green-400 bg-white"
                            >
                                <option value="Débutant">Débutant</option>
                                <option value="Intermédiaire">Intermédiaire</option>
                                <option value="Avancé">Avancé</option>
                                <option value="Courant">Courant</option>
                                <option value="Natif">Natif</option>
                            </select>
                            <button onClick={() => handleAddItem('languages')} className="p-1.5 bg-green-500 text-white rounded-md hover:bg-green-600">
                                <Plus size={14} />
                            </button>
                        </div>
                      )}
                  </div>
              </div>

          </div>
      ) : (
      
      // --- FEED VIEW ---
      <>
        {/* Active Live Player (Mock) */}
        {activeLive && (
            <div className="bg-black text-white relative animate-in fade-in slide-in-from-top-4">
                <div className="aspect-video w-full flex items-center justify-center bg-slate-900 relative overflow-hidden">
                    <div className={`absolute inset-0 ${activeLive.thumbnailColor} opacity-20`}></div>
                    <div className="z-10 text-center p-8">
                        <div className="w-20 h-20 bg-slate-800 rounded-full mx-auto mb-4 flex items-center justify-center animate-pulse">
                            <span className="text-3xl">🤖</span>
                        </div>
                        <h3 className="text-xl font-bold">{activeLive.title}</h3>
                        <p className="text-slate-400">Diffusion en direct simulée</p>
                        <button className="mt-4 px-6 py-2 bg-red-600 rounded-full font-bold text-sm hover:bg-red-700 transition-colors">
                            Rejoindre le Panel
                        </button>
                    </div>
                    <button onClick={() => setActiveLive(null)} className="absolute top-4 right-4 bg-black/50 p-2 rounded-full hover:bg-black/80">
                        × Fermer
                    </button>
                </div>
            </div>
        )}

        {/* Main Social Feed */}
        <div className="max-w-2xl mx-auto w-full pb-8 px-4 md:px-0">
            
            {/* Composer */}
            <div className="bg-white p-4 shadow-sm rounded-b-xl mb-6 border border-t-0 border-slate-200">
                <div className="flex gap-3">
                    <div className="shrink-0">
                         {renderUserAvatar(userProfile.name)}
                    </div>
                    <div className="flex-1">
                        <textarea
                            value={newPostContent}
                            onChange={(e) => setNewPostContent(e.target.value)}
                            placeholder="Exprimez-vous..."
                            className="w-full resize-none outline-none text-slate-700 placeholder-slate-400 min-h-[60px] text-base"
                        />
                        
                        {/* Generator UI */}
                        {mediaMode !== 'none' && (
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-3 animate-in fade-in zoom-in-95">
                                <div className="flex gap-2 mb-2">
                                    <input 
                                        type="text" 
                                        value={generationPrompt}
                                        onChange={(e) => setGenerationPrompt(e.target.value)}
                                        placeholder={mediaMode === 'veo' ? "Description pour vidéo courte (TikTok/Shorts)..." : "Décrivez l'image..."}
                                        className="flex-1 p-2 text-sm border rounded shadow-sm"
                                    />
                                    <button 
                                        onClick={handleGenerate} 
                                        disabled={isGenerating || !generationPrompt}
                                        className="bg-brand-accent text-white px-4 py-2 rounded text-sm disabled:opacity-50 hover:bg-blue-600 transition-colors"
                                    >
                                        {isGenerating ? <Loader2 className="animate-spin" size={16}/> : (mediaMode === 'veo' ? 'Générer Vidéo Short' : <Sparkles size={16}/>)}
                                    </button>
                                </div>
                                {generatedMedia && (
                                    <div className="mt-2 rounded-lg overflow-hidden relative border border-slate-200 shadow-sm flex justify-center bg-black">
                                        {generatedMedia.type === 'video' ? (
                                            <video src={generatedMedia.url} controls autoPlay loop className="max-w-full h-auto max-h-[400px] object-contain" />
                                        ) : (
                                            <img src={generatedMedia.url} alt="Generated" className="w-full h-auto max-h-60 object-cover" />
                                        )}
                                        <button 
                                            onClick={() => setGeneratedMedia(null)}
                                            className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-black"
                                        >×</button>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100">
                            <div className="flex gap-1 text-slate-500">
                                <button 
                                    onClick={() => setMediaMode(mediaMode === 'image' ? 'none' : 'image')}
                                    className={`p-2 rounded-full hover:bg-slate-100 transition-colors ${mediaMode === 'image' ? 'text-brand-accent bg-blue-50' : ''}`}
                                    title="Générer Image (Gemini)"
                                >
                                    <ImageIcon size={20} />
                                </button>
                                <button 
                                    onClick={() => setMediaMode(mediaMode === 'veo' ? 'none' : 'veo')}
                                    className={`p-2 rounded-full hover:bg-slate-100 transition-colors ${mediaMode === 'veo' ? 'text-brand-accent bg-blue-50' : ''}`}
                                    title="Générer Vidéo Short (Veo)"
                                >
                                    <Video size={20} />
                                </button>
                            </div>
                            <button 
                                onClick={handlePost}
                                disabled={!newPostContent && !generatedMedia}
                                className="bg-brand-dark text-white px-6 py-2 rounded-full font-bold text-sm hover:bg-slate-800 disabled:opacity-50 transition-all shadow-md hover:shadow-lg"
                            >
                                Publier
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Posts List */}
            <div className="space-y-4">
                {posts.map(post => (
                    <div key={post.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3 mb-3">
                            {renderUserAvatar(post.user)}
                            <div>
                                <div className="font-bold text-slate-900">{post.user}</div>
                                <div className="text-xs text-slate-400">À l'instant • 🌍 Public</div>
                            </div>
                        </div>
                        
                        <p className="text-slate-800 mb-4 whitespace-pre-wrap text-[15px] leading-relaxed">{post.content}</p>
                        
                        {post.videoUrl && (
                            <div className="rounded-xl overflow-hidden mb-4 bg-black shadow-inner flex justify-center">
                                <video src={post.videoUrl} controls className="max-w-full max-h-[500px]" />
                            </div>
                        )}
                        {post.imageUrl && (
                            <div className="rounded-xl overflow-hidden mb-4 shadow-sm border border-slate-100">
                                <img src={post.imageUrl} alt="Post content" className="w-full h-auto max-h-[400px] object-cover" />
                            </div>
                        )}

                        <div className="flex items-center justify-between text-slate-500 pt-3 border-t border-slate-50">
                            <button className="flex items-center gap-2 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50">
                                <Heart size={18} /> <span className="text-sm font-medium">{post.likes}</span>
                            </button>
                            <button className="flex items-center gap-2 hover:text-blue-500 transition-colors px-2 py-1 rounded hover:bg-blue-50">
                                <MessageCircle size={18} /> <span className="text-sm font-medium">Répondre</span>
                            </button>
                            <button className="flex items-center gap-2 hover:text-green-500 transition-colors px-2 py-1 rounded hover:bg-green-50">
                                <Share2 size={18} /> <span className="text-sm font-medium">Partager</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </>
      )}
    </div>
  );
};
