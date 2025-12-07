
import React, { useState, useRef, useEffect } from 'react';
import { ExpertType, ChatMessage } from '../types';
import { generateResponse, connectLiveSession, decodeAudioData } from '../services/geminiService';
import { 
  Scale, Stethoscope, GraduationCap, Briefcase, 
  Home, Plane, Mic, Send, Image as ImageIcon, MapPin, Search, Brain, X, Loader, Phone, PhoneOff, MicOff, ShieldCheck,
  Paperclip, Camera, Sparkles, PenTool, Type, Wand2, Landmark, FileText, Globe, AlertCircle, Video
} from 'lucide-react';

const Experts = [
  { id: ExpertType.DIALLO, name: 'Diallo', role: 'Communication', icon: <div className="font-bold text-xl">D</div>, color: 'bg-blue-600', welcome: "Bonjour ! Je suis Diallo, votre assistant personnel. Comment puis-je vous aider aujourd'hui ?" },
  { id: ExpertType.MAITRE, name: 'Maître Diallo', role: 'Justice', icon: <Scale size={20} />, color: 'bg-red-700', welcome: "Bienvenue au cabinet. Je suis Maître Diallo. Quelle est votre préoccupation juridique ?" },
  { id: ExpertType.DOCTEUR, name: 'Dr. Diallo', role: 'Santé', icon: <Stethoscope size={20} />, color: 'bg-green-600', welcome: "Bonjour. Je suis le Dr. Diallo. Parlons de votre santé et de prévention." },
  { id: ExpertType.PROFESSEUR, name: 'Prof. Diallo', role: 'Éducation', icon: <GraduationCap size={20} />, color: 'bg-yellow-600', welcome: "Bonjour chers apprenants. Sur quel sujet souhaitez-vous travailler ?" },
  { id: ExpertType.CONSEILLER, name: 'Conseiller', role: 'Emploi', icon: <Briefcase size={20} />, color: 'bg-purple-600', welcome: "Prêt à booster votre carrière ? Je suis là pour votre CV et vos projets." },
  { id: ExpertType.MONSIEUR, name: 'M. Diallo', role: 'Logement', icon: <Home size={20} />, color: 'bg-orange-600', welcome: "Besoin d'un logement ou d'une aide ? Je suis là pour vous orienter." },
  { id: ExpertType.GUIDE, name: 'Guide Diallo', role: 'Voyage', icon: <Plane size={20} />, color: 'bg-sky-500', welcome: "Le monde est vaste ! Où souhaitez-vous aller ?" },
];

const LANGUAGES = [
    { code: 'fr', name: 'Français' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'ar', name: 'العربية' },
    { code: 'wo', name: 'Wolof' },
    { code: 'ff', name: 'Pulaar' },
    { code: 'man', name: 'Malinké' },
    { code: 'sw', name: 'Swahili' },
    { code: 'ln', name: 'Lingala' },
];

// Define props to receive credit functions from App
interface DialloAssistantsProps {
    userCredits?: number;
    deductCredits?: (amount: number) => boolean;
}

export const DialloAssistants: React.FC<DialloAssistantsProps> = ({ userCredits = 999, deductCredits = (_: number) => true }) => {
  const [activeExpert, setActiveExpert] = useState<ExpertType>(ExpertType.DIALLO);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [grounding, setGrounding] = useState<'none' | 'search' | 'maps'>('none');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('fr');
  
  // Live Call State
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<'connecting' | 'connected' | 'ended'>('ended');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  
  // Audio State
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const liveSessionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Clear chat when switching experts
  useEffect(() => {
    const expert = Experts.find(e => e.id === activeExpert);
    if (expert) {
        setMessages([{
            id: 'welcome',
            role: 'model',
            text: expert.welcome
        }]);
    }
  }, [activeExpert]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Call Timer
  useEffect(() => {
    if (callStatus === 'connected') {
      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      if (callStatus === 'ended') setCallDuration(0);
    }
    return () => clearInterval(timerRef.current);
  }, [callStatus]);

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    // CREDIT CHECK
    if (!deductCredits(1)) {
        // Not enough credits
        return;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      image: selectedImage || undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const history = messages.filter(m => m.id !== 'welcome').map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      
      const langName = LANGUAGES.find(l => l.code === selectedLanguage)?.name || 'Français';
      const promptWithLang = `[Langue: ${langName}] ${userMsg.text}`;

      const response = await generateResponse(
        activeExpert,
        history,
        promptWithLang,
        userMsg.image ? userMsg.image.split(',')[1] : undefined,
        isThinking,
        grounding
      );

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text,
        groundingUrls: response.groundingUrls,
        isThinking: isThinking
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "Désolé, une erreur technique est survenue. Veuillez réessayer."
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAiAction = (action: 'correct' | 'text' | 'image' | 'video' | 'doc') => {
      setShowAiMenu(false);
      let promptPrefix = "";
      switch(action) {
          case 'correct': promptPrefix = "Corrige l'orthographe et améliore le style : "; break;
          case 'text': promptPrefix = "Rédige un texte complet sur : "; break;
          case 'image': promptPrefix = "Génère une image réaliste de : "; break;
          case 'video': promptPrefix = "Génère une vidéo (Veo) montrant : "; break;
          case 'doc': promptPrefix = "Génère un document formel (PDF/Word) sur : "; break;
      }
      
      if (input.trim()) {
          setInput(`${promptPrefix}${input}`);
      } else {
          setInput(promptPrefix);
      }
      inputRef.current?.focus();
  };

  const handleAdminAction = (action: string) => {
      setShowAdminMenu(false);
      setActiveExpert(ExpertType.MAITRE);
      let prompt = "";
      switch(action) {
          case 'visa': prompt = "Je souhaite obtenir un Visa pour [Pays]. Quelles sont les étapes ?"; break;
          case 'sejour': prompt = "Je dois faire une demande ou un renouvellement de Titre de Séjour."; break;
          case 'asile': prompt = "Je souhaite m'informer sur la procédure de demande d'Asile."; break;
          case 'naturalisation': prompt = "Quelles sont les conditions pour demander la Naturalisation ?"; break;
          case 'regroupement': prompt = "Je souhaite faire venir ma famille (Regroupement Familial)."; break;
      }
      setInput(prompt);
      inputRef.current?.focus();
  };

  const toggleDictation = () => {
      if (isRecording) {
          if (recognitionRef.current) recognitionRef.current.stop();
          setIsRecording(false);
          return;
      }
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
          alert("Votre navigateur ne supporte pas la dictée vocale.");
          return;
      }
      const recognition = new SpeechRecognition();
      recognition.lang = selectedLanguage === 'en' ? 'en-US' : 'fr-FR'; 
      recognition.onstart = () => setIsRecording(true);
      recognition.onend = () => setIsRecording(false);
      recognition.onerror = () => setIsRecording(false);
      recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInput(prev => prev + (prev ? ' ' : '') + transcript);
      };
      recognitionRef.current = recognition;
      recognition.start();
  };

  const startCall = async () => {
    // CREDIT CHECK FOR CALLS
    if (!deductCredits(10)) {
        return;
    }

    setIsCallActive(true);
    setCallStatus('connecting');
    outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    nextStartTimeRef.current = 0;

    try {
      const sessionPromise = connectLiveSession(
        activeExpert,
        async (base64Audio) => {
          if (!outputAudioCtxRef.current) return;
          const ctx = outputAudioCtxRef.current;
          nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
          const audioBuffer = await decodeAudioData(base64Audio, ctx);
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.start(nextStartTimeRef.current);
          nextStartTimeRef.current += audioBuffer.duration;
        },
        () => {
          endCall();
        }
      );
      liveSessionRef.current = sessionPromise;
      setCallStatus('connected');
    } catch (e) {
      console.error(e);
      endCall();
    }
  };

  const endCall = () => {
    if (liveSessionRef.current) {
        liveSessionRef.current.then((s: any) => s.close());
    }
    setCallStatus('ended');
    setIsCallActive(false);
    setIsMuted(false);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const activeExpertData = Experts.find(e => e.id === activeExpert);

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
      
      {/* Call Overlay */}
      {isCallActive && activeExpertData && (
        <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col items-center justify-between py-12 px-6 animate-in fade-in duration-300">
            <div className={`absolute inset-0 opacity-20 blur-3xl ${activeExpertData.color}`}></div>
            
            <div className="relative z-10 text-center">
                <h3 className="text-white/60 text-sm uppercase tracking-widest font-bold mb-2">Appel Vocal Sécurisé</h3>
                <div className="flex items-center justify-center gap-2 text-white/40 text-xs">
                    <ShieldCheck size={12} /> Chiffré de bout en bout
                </div>
            </div>

            <div className="relative z-10 flex flex-col items-center">
                <div className="relative">
                    <div className={`absolute inset-0 rounded-full ${activeExpertData.color} opacity-30 animate-ping`}></div>
                    <div className={`absolute inset-[-15px] rounded-full ${activeExpertData.color} opacity-20 animate-pulse`}></div>
                    <div className={`w-32 h-32 rounded-full border-4 border-white/10 shadow-2xl flex items-center justify-center text-white text-4xl relative z-10 ${activeExpertData.color}`}>
                        {activeExpertData.icon}
                    </div>
                </div>
                
                <h2 className="text-3xl font-bold text-white mt-8 mb-2">{activeExpertData.name}</h2>
                <p className="text-white/60 text-lg font-medium">{activeExpertData.role}</p>
                <div className="mt-6 px-4 py-1 bg-white/10 rounded-full text-white font-mono text-sm border border-white/5">
                    {callStatus === 'connecting' ? 'Connexion en cours...' : formatDuration(callDuration)}
                </div>
            </div>

            <div className="relative z-10 flex items-center gap-8 mb-8">
                 <button 
                    onClick={() => setIsMuted(!isMuted)}
                    className={`p-5 rounded-full backdrop-blur-md transition-all ${isMuted ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`}
                 >
                    {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
                 </button>

                 <button 
                    onClick={endCall}
                    className="p-6 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/30 transform hover:scale-105 transition-all"
                 >
                    <PhoneOff size={32} />
                 </button>

                 <button className="p-5 rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-md transition-all">
                    <Brain size={28} />
                 </button>
            </div>
        </div>
      )}

      {/* Expert Selector Header & Language */}
      <div className="bg-white shadow-sm border-b border-slate-100 z-10 flex flex-col">
          <div className="flex justify-between items-center px-4 pt-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vos Experts</span>
              <div className="flex items-center gap-3">
                  <div className="bg-slate-100 px-2 py-1 rounded text-[10px] font-bold text-slate-600 flex items-center gap-1 border border-slate-200">
                      Solde: <span className={`text-brand-gold ${userCredits < 5 ? 'text-red-500 animate-pulse' : ''}`}>{userCredits} 💎</span>
                  </div>
                  <div className="flex items-center gap-2">
                      <Globe size={14} className="text-slate-400" />
                      <select 
                        value={selectedLanguage}
                        onChange={(e) => setSelectedLanguage(e.target.value)}
                        className="text-xs bg-slate-100 border-none rounded-md py-1 px-2 text-slate-700 font-bold outline-none cursor-pointer hover:bg-slate-200"
                      >
                          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                      </select>
                  </div>
              </div>
          </div>
          <div className="flex overflow-x-auto p-4 gap-4 scrollbar-hide">
            {Experts.map((exp) => (
            <button
                key={exp.id}
                onClick={() => setActiveExpert(exp.id)}
                className={`flex flex-col items-center min-w-[70px] transition-all group ${
                activeExpert === exp.id ? 'opacity-100' : 'opacity-60 hover:opacity-100'
                }`}
            >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white mb-2 shadow-md transition-transform group-hover:scale-105 ${
                    activeExpert === exp.id ? `${exp.color} ring-2 ring-offset-2 ring-brand-gold` : 'bg-slate-400'
                }`}>
                {exp.icon}
                </div>
                <span className={`text-[10px] font-bold text-center ${activeExpert === exp.id ? 'text-brand-dark' : 'text-slate-500'}`}>
                    {exp.name}
                </span>
            </button>
            ))}
          </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'model' && (
                <div className={`w-8 h-8 rounded-full flex-shrink-0 mr-2 flex items-center justify-center text-white text-xs shadow-sm ${activeExpertData?.color}`}>
                    {activeExpertData?.icon}
                </div>
            )}
            <div
              className={`max-w-[85%] p-4 rounded-2xl shadow-sm text-[15px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-brand-dark text-white rounded-tr-none'
                  : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
              }`}
            >
              {msg.image && (
                <img src={msg.image} alt="Upload" className="max-w-full h-auto rounded-lg mb-3 border border-slate-200" />
              )}
              
              <div className="whitespace-pre-wrap">{msg.text}</div>
              
              {msg.isThinking && (
                  <div className="mt-2 text-[10px] text-purple-600 font-medium flex items-center gap-1">
                      <Brain size={12} /> Réponse générée avec Gemini Thinking Mode
                  </div>
              )}

              {msg.groundingUrls && msg.groundingUrls.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                    <Search size={10} /> Sources vérifiées
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {msg.groundingUrls.map((source, idx) => (
                      <a 
                        key={idx} 
                        href={source.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs bg-slate-50 hover:bg-slate-100 text-blue-600 px-3 py-1.5 rounded-lg border border-slate-200 truncate max-w-[200px] flex items-center gap-1"
                      >
                         {source.title}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
             <div className={`w-8 h-8 rounded-full flex-shrink-0 mr-2 flex items-center justify-center text-white text-xs shadow-sm ${activeExpertData?.color}`}>
                {activeExpertData?.icon}
            </div>
            <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2 border border-slate-100">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-200"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-200">
        
        {/* Tools Toolbar */}
        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
             <ToolToggle 
                active={grounding === 'search'} 
                onClick={() => setGrounding(grounding === 'search' ? 'none' : 'search')}
                icon={<Search size={14} />}
                label="Recherche Web"
                color="blue"
             />
             <ToolToggle 
                active={grounding === 'maps'} 
                onClick={() => setGrounding(grounding === 'maps' ? 'none' : 'maps')}
                icon={<MapPin size={14} />}
                label="Maps"
                color="green"
             />
             <ToolToggle 
                active={isThinking} 
                onClick={() => setIsThinking(!isThinking)}
                icon={<Brain size={14} />}
                label="Mode Réflexion (Pro)"
                color="purple"
             />
        </div>

        {selectedImage && (
            <div className="relative inline-block mb-3 animate-in fade-in zoom-in-95">
                <img src={selectedImage} alt="Preview" className="h-20 rounded-lg border border-slate-200 shadow-sm" />
                <button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-500 transition-colors">
                    <X size={12}/>
                </button>
            </div>
        )}

        <div className="flex items-center gap-2 relative">
          
          <label className="p-3 rounded-full hover:bg-slate-100 cursor-pointer transition-colors text-slate-500 hover:text-brand-dark" title="Joindre un fichier">
            <input type="file" className="hidden" onChange={handleFileUpload} />
            <Paperclip size={22} />
          </label>

          {/* AI Tools */}
          <div className="relative">
             <button 
                onClick={() => { setShowAiMenu(!showAiMenu); setShowAdminMenu(false); }}
                className={`p-3 rounded-full transition-colors ${showAiMenu ? 'bg-purple-100 text-purple-600' : 'hover:bg-purple-50 text-purple-500'}`}
                title="Outils IA (Texte, Image, Vidéo)"
             >
                <Sparkles size={22} />
             </button>
             {/* ... (AI Menu - same as before) ... */}
             {showAiMenu && (
                 <div className="absolute bottom-14 left-0 w-60 bg-white rounded-xl shadow-xl border border-slate-100 p-2 z-20 animate-in slide-in-from-bottom-2 fade-in">
                     <button onClick={() => handleAiAction('correct')} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700 flex items-center gap-2">
                         <PenTool size={16} className="text-blue-500"/> Corriger & Améliorer
                     </button>
                     <button onClick={() => handleAiAction('text')} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700 flex items-center gap-2">
                         <Type size={16} className="text-green-500"/> Générer du Texte
                     </button>
                     <button onClick={() => handleAiAction('doc')} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700 flex items-center gap-2">
                         <FileText size={16} className="text-orange-500"/> Générer Document
                     </button>
                     <div className="border-t border-slate-100 my-1"></div>
                     <button onClick={() => handleAiAction('image')} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700 flex items-center gap-2">
                         <Wand2 size={16} className="text-purple-500"/> Générer une Image
                     </button>
                     <button onClick={() => handleAiAction('video')} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700 flex items-center gap-2">
                         <Video size={16} className="text-red-500"/> Générer une Vidéo (Veo)
                     </button>
                 </div>
             )}
          </div>

          {/* Admin Menu */}
          <div className="relative">
             <button 
                onClick={() => { setShowAdminMenu(!showAdminMenu); setShowAiMenu(false); }}
                className={`p-3 rounded-full transition-colors ${showAdminMenu ? 'bg-brand-gold text-brand-dark' : 'hover:bg-amber-50 text-amber-600'}`}
                title="Aide Administrative & Immigration"
             >
                <Landmark size={22} />
             </button>
             {/* ... (Admin Menu - same as before) ... */}
             {showAdminMenu && (
                 <div className="absolute bottom-14 left-0 w-64 bg-white rounded-xl shadow-xl border border-slate-100 p-2 z-20 animate-in slide-in-from-bottom-2 fade-in">
                     <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Guichet Administratif</div>
                     <button onClick={() => handleAdminAction('visa')} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700 flex items-center gap-2">
                         <Plane size={16} className="text-sky-500"/> Demande de Visa
                     </button>
                     <button onClick={() => handleAdminAction('sejour')} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700 flex items-center gap-2">
                         <FileText size={16} className="text-blue-600"/> Titre de Séjour
                     </button>
                     <button onClick={() => handleAdminAction('asile')} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700 flex items-center gap-2">
                         <ShieldCheck size={16} className="text-red-500"/> Demande d'Asile
                     </button>
                     <button onClick={() => handleAdminAction('regroupement')} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700 flex items-center gap-2">
                         <Home size={16} className="text-orange-500"/> Regroupement Familial
                     </button>
                     <button onClick={() => handleAdminAction('naturalisation')} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700 flex items-center gap-2">
                         <Landmark size={16} className="text-brand-dark"/> Naturalisation
                     </button>
                 </div>
             )}
          </div>

          <label className="p-3 rounded-full hover:bg-slate-100 cursor-pointer transition-colors text-slate-500 hover:text-brand-dark" title="Prendre une photo">
             <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
             <Camera size={22} />
          </label>
          
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={`Message... (1 crédit)`}
              className="w-full p-4 pl-4 pr-12 rounded-full bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-gold text-slate-800 placeholder-slate-400 transition-all"
            />
            <button 
                onClick={toggleDictation}
                className={`absolute right-2 top-1/2 transform -translate-y-1/2 p-2 rounded-full transition-all ${isRecording ? 'text-red-500 animate-pulse bg-red-50' : 'text-slate-400 hover:text-slate-600'}`}
                title="Dictée vocale"
            >
                {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          </div>

          <button
            onClick={startCall}
            className={`p-4 rounded-full transition-all shadow-sm bg-green-500 text-white hover:bg-green-600 hover:shadow-green-200 hover:scale-105 active:scale-95`}
            title="Appeler l'expert (Live Audio)"
          >
            <Phone size={24} />
          </button>

          <button
            onClick={handleSend}
            disabled={!input.trim() && !selectedImage}
            className="p-4 rounded-full bg-brand-dark text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
          >
            <Send size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};

const ToolToggle = ({ active, onClick, icon, label, color }: any) => {
    const activeClass = color === 'blue' ? 'bg-blue-100 border-blue-200 text-blue-700' : 
                        color === 'green' ? 'bg-green-100 border-green-200 text-green-700' :
                        'bg-purple-100 border-purple-200 text-purple-700';
    
    return (
        <button 
            onClick={onClick}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all whitespace-nowrap ${
                active ? activeClass : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
        >
            {icon} {label}
        </button>
    );
}
