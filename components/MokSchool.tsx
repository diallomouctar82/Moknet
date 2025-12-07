import React, { useState, useEffect } from 'react';
import { Course, CourseModule } from '../types';
import { generateResponse, generateImage } from '../services/geminiService';
import { ExpertType } from '../types';
import { 
  BookOpen, Award, PlayCircle, CheckCircle, Upload, GraduationCap, 
  Lock, Unlock, Star, Video, ArrowLeft, ChevronRight, Lightbulb, LockKeyhole
} from 'lucide-react';

const COURSES: Course[] = [
  { 
    id: '1', 
    title: 'Mécanique Auto : Moteurs', 
    description: 'Maîtrisez le diagnostic et la réparation des moteurs essence et diesel.', 
    faculty: 'MÉTIERS', 
    level: 'Niveau 1',
    modules: [
      { id: 'm1', title: 'Fonctionnement du cycle 4 temps', duration: '15 min', type: 'theory', isLocked: false },
      { id: 'm2', title: 'SECRET : Écouter le moteur', duration: '10 min', type: 'secret', isLocked: false },
      { id: 'm3', title: 'Diagnostic panne allumage', duration: '20 min', type: 'practice', isLocked: true },
    ]
  },
  { 
    id: '2', 
    title: 'Agriculture : Permaculture Sahel', 
    description: 'Techniques avancées pour cultiver en zone aride avec peu d\'eau.', 
    faculty: 'AGRICULTURE', 
    level: 'Niveau 2',
    modules: [
        { id: 'a1', title: 'Gestion de l\'eau et des sols', duration: '25 min', type: 'theory', isLocked: false },
        { id: 'a2', title: 'SECRET : Le Zaï amélioré', duration: '12 min', type: 'secret', isLocked: false },
        { id: 'a3', title: 'Projet : Créer sa pépinière', duration: '30 min', type: 'practice', isLocked: true },
    ] 
  },
  { 
    id: '3', 
    title: 'Business : De l\'Idée au Projet', 
    description: 'Transformer une idée simple en entreprise rentable en 30 jours.', 
    faculty: 'BUSINESS', 
    level: 'Avancé',
    modules: [
        { id: 'b1', title: 'Le Business Model Canvas', duration: '40 min', type: 'theory', isLocked: false },
        { id: 'b2', title: 'SECRET : Négocier sans argent', duration: '15 min', type: 'secret', isLocked: true },
        { id: 'b3', title: 'Pitcher son projet', duration: '10 min', type: 'practice', isLocked: true },
    ]
  },
];

const COURSE_PRICE = 50; // Credits

interface MokSchoolProps {
    userCredits?: number;
    deductCredits?: (amount: number) => boolean;
}

export const MokSchool: React.FC<MokSchoolProps> = ({ userCredits = 999, deductCredits = (_: number) => true }) => {
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [activeModule, setActiveModule] = useState<CourseModule | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [courseImage, setCourseImage] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'content'|'live'|'exam'>('content');
  
  // Enrollment State
  const [enrolledCourses, setEnrolledCourses] = useState<string[]>(() => {
      const saved = localStorage.getItem('mok_user_profile');
      if (saved) {
          try {
              const p = JSON.parse(saved);
              // Mocking a list of enrolled IDs from profile if present, else empty
              return p.enrolledCourseIds || []; 
          } catch(e) { return []; }
      }
      return [];
  });

  const isEnrolled = activeCourse ? enrolledCourses.includes(activeCourse.id) : false;

  const handleEnroll = () => {
      if (!deductCredits(COURSE_PRICE)) return; // Checks balance and opens shop if needed
      
      if (activeCourse) {
          const newEnrollments = [...enrolledCourses, activeCourse.id];
          setEnrolledCourses(newEnrollments);
          
          // Persist to user profile
          const saved = localStorage.getItem('mok_user_profile');
          if (saved) {
              const p = JSON.parse(saved);
              p.enrolledCourseIds = newEnrollments;
              localStorage.setItem('mok_user_profile', JSON.stringify(p));
          }
          alert(`Inscription réussie au cours : ${activeCourse.title}`);
      }
  };

  const handleHomeworkAnalysis = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAnalyzing(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const res = await generateResponse(
            ExpertType.PROFESSEUR,
            [],
            "Tu es Professeur Diallo. Analyse ce travail d'étudiant avec bienveillance mais rigueur. Donne : 1) Une note sur 20. 2) Trois points forts. 3) Trois axes d'amélioration concrets. 4) Un conseil 'Secret du métier'.",
            base64,
            true // Use Thinking model for grading
          );
          setAnalysisResult(res.text);
        } catch (err) {
          setAnalysisResult("Erreur lors de l'analyse. Veuillez réessayer.");
        } finally {
          setAnalyzing(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (activeCourse) {
        setCourseImage(''); 
        setActiveModule(activeCourse.modules[0]);
    }
  }, [activeCourse]);

  if (activeCourse) {
    return (
      <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
        {/* Course Header */}
        <div className="bg-brand-dark text-white p-4 flex items-center gap-4 shadow-md z-10">
            <button onClick={() => setActiveCourse(null)} className="p-2 hover:bg-white/10 rounded-full">
                <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
                <h2 className="font-bold text-lg leading-tight">{activeCourse.title}</h2>
                <div className="text-xs text-brand-gold opacity-90">{activeCourse.faculty} • {activeCourse.level}</div>
            </div>
            {!isEnrolled && (
                <div className="bg-slate-800 px-3 py-1 rounded text-xs text-slate-300 border border-slate-700">
                    Non inscrit
                </div>
            )}
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
            
            {/* PAYWALL OVERLAY if not enrolled */}
            {!isEnrolled && (
                <div className="absolute inset-0 z-50 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
                    <div className="w-24 h-24 bg-brand-gold rounded-full flex items-center justify-center mb-6 shadow-xl shadow-brand-gold/20">
                        <LockKeyhole size={48} className="text-brand-dark" />
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-2">Cours Premium</h2>
                    <p className="text-slate-300 max-w-md mb-8 text-lg">
                        Inscrivez-vous pour accéder aux modules, aux secrets de fabrication et à la correction par IA.
                    </p>
                    
                    <div className="bg-white/10 p-6 rounded-2xl border border-white/20 mb-8 w-full max-w-sm">
                        <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-4">
                            <span className="text-slate-300">Coût d'inscription</span>
                            <span className="text-2xl font-bold text-brand-gold">{COURSE_PRICE} 💎</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-400">Votre solde</span>
                            <span className={`font-bold ${userCredits < COURSE_PRICE ? 'text-red-400' : 'text-green-400'}`}>
                                {userCredits} 💎
                            </span>
                        </div>
                    </div>

                    <button 
                        onClick={handleEnroll}
                        className="bg-brand-gold hover:bg-yellow-500 text-brand-dark font-bold text-lg px-8 py-4 rounded-xl shadow-lg hover:scale-105 transition-all flex items-center gap-3"
                    >
                        <GraduationCap /> S'inscrire maintenant
                    </button>
                    {userCredits < COURSE_PRICE && (
                        <p className="mt-4 text-red-400 text-sm">Crédits insuffisants. Rechargez dans la boutique.</p>
                    )}
                </div>
            )}

            {/* Main Content Area (Blurred/Protected visually if needed, but overlay covers it) */}
            <div className={`flex-1 overflow-y-auto p-4 md:p-6 ${!isEnrolled ? 'filter blur-sm pointer-events-none' : ''}`}>
                {/* Video Player Placeholder */}
                <div className="aspect-video bg-black rounded-xl mb-6 relative group overflow-hidden shadow-xl">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:scale-110 transition-transform cursor-pointer">
                            <PlayCircle size={40} className="text-white fill-white" />
                        </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                        <h3 className="text-white font-medium">{activeModule?.title || "Sélectionnez un module"}</h3>
                        <p className="text-slate-300 text-xs mt-1">Professeur Diallo • {activeModule?.duration}</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 mb-6">
                    <button 
                        onClick={() => setActiveTab('content')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'content' ? 'border-brand-accent text-brand-accent' : 'border-transparent text-slate-500'}`}
                    >
                        Contenu du Cours
                    </button>
                    <button 
                         onClick={() => setActiveTab('exam')}
                         className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'exam' ? 'border-brand-accent text-brand-accent' : 'border-transparent text-slate-500'}`}
                    >
                        Devoirs & Examen
                    </button>
                </div>

                {activeTab === 'content' && (
                    <div className="space-y-4">
                        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                            <h3 className="font-bold text-lg mb-2">À propos de ce module</h3>
                            <p className="text-slate-600 leading-relaxed">
                                Dans ce module, nous allons explorer les fondamentaux essentiels. 
                                Le Professeur Diallo insiste particulièrement sur la pratique et l'observation, 
                                clés de la réussite dans ce domaine.
                            </p>
                        </div>
                        
                        <div className="bg-brand-gold/10 border border-brand-gold/30 p-6 rounded-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Lightbulb size={100} className="text-brand-gold" />
                            </div>
                            <h3 className="font-bold text-brand-dark flex items-center gap-2 mb-2">
                                <Star className="fill-brand-gold text-brand-gold" size={20}/> 
                                LE SECRET DU MÉTIER
                            </h3>
                            <p className="text-slate-800 text-sm font-medium italic relative z-10">
                                "La plupart des débutants regardent, mais l'expert écoute. Avant même de toucher, 
                                apprenez à identifier le problème par le son. C'est ce qui distingue l'amateur du maître."
                            </p>
                        </div>
                    </div>
                )}

                {activeTab === 'exam' && (
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                            <Upload className="text-brand-accent" /> Soumettre votre travail
                        </h3>
                        <p className="text-slate-600 mb-6 text-sm">
                            Pour valider ce module, prenez une photo de votre réalisation pratique ou de vos notes. 
                            L'IA du Professeur Diallo corrigera instantanément votre travail.
                        </p>

                        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors relative">
                            <input 
                                type="file" 
                                onChange={handleHomeworkAnalysis} 
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                accept="image/*"
                            />
                            <div className="pointer-events-none">
                                <Upload className="mx-auto h-12 w-12 text-slate-400" />
                                <p className="mt-2 text-sm font-medium text-slate-900">Cliquez pour uploader</p>
                                <p className="mt-1 text-xs text-slate-500">JPG, PNG jusqu'à 10MB</p>
                            </div>
                        </div>

                        {analyzing && (
                            <div className="mt-6 p-4 bg-blue-50 text-blue-700 rounded-lg flex items-center gap-3">
                                <div className="animate-spin h-5 w-5 border-2 border-blue-700 border-t-transparent rounded-full"></div>
                                Analyse pédagogique en cours par Gemini Pro...
                            </div>
                        )}

                        {analysisResult && (
                            <div className="mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="bg-brand-dark text-white p-3 rounded-t-lg font-bold flex justify-between items-center">
                                    <span>Correction du Professeur</span>
                                    <Award className="text-brand-gold" />
                                </div>
                                <div className="bg-slate-50 p-4 rounded-b-lg border border-slate-200 border-t-0 text-slate-800 whitespace-pre-wrap text-sm leading-relaxed shadow-inner">
                                    {analysisResult}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Curriculum Sidebar */}
            <div className={`w-full md:w-80 bg-white border-l border-slate-200 overflow-y-auto ${!isEnrolled ? 'filter blur-sm pointer-events-none' : ''}`}>
                <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <h3 className="font-bold text-slate-800">Programme</h3>
                    <div className="text-xs text-slate-500 mt-1">3 modules • 45 min total</div>
                </div>
                <div className="p-2 space-y-1">
                    {activeCourse.modules.map((mod, idx) => (
                        <button
                            key={mod.id}
                            onClick={() => setActiveModule(mod)}
                            disabled={mod.isLocked}
                            className={`w-full text-left p-3 rounded-lg flex items-start gap-3 transition-colors ${
                                activeModule?.id === mod.id 
                                    ? 'bg-brand-gold/10 border border-brand-gold/50' 
                                    : mod.isLocked 
                                        ? 'opacity-50 cursor-not-allowed' 
                                        : 'hover:bg-slate-50'
                            }`}
                        >
                            <div className="mt-1">
                                {mod.isLocked ? <Lock size={16} /> : (
                                    mod.type === 'secret' ? <Star size={16} className="text-brand-gold fill-brand-gold"/> :
                                    activeModule?.id === mod.id ? <PlayCircle size={16} className="text-brand-dark"/> : 
                                    <CheckCircle size={16} className="text-green-500"/>
                                )}
                            </div>
                            <div>
                                <div className={`text-sm font-medium ${activeModule?.id === mod.id ? 'text-brand-dark' : 'text-slate-600'}`}>
                                    {mod.title}
                                </div>
                                <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                    <Video size={10} /> {mod.duration} • {mod.type === 'secret' ? 'Secret Pro' : mod.type === 'theory' ? 'Théorie' : 'Pratique'}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
      </div>
    );
  }

  // Catalogue View
  return (
    <div className="h-full bg-slate-50 overflow-y-auto">
      <header className="bg-white p-6 border-b border-slate-200">
          <h1 className="text-3xl font-bold text-brand-dark">ÉCOLES MOK</h1>
          <p className="text-slate-500 mt-2">L'Université Virtuelle Mondiale. Apprenez un métier, changez votre vie.</p>
          
          <div className="flex gap-2 mt-6 overflow-x-auto pb-2 scrollbar-hide">
             {['TOUT', 'MÉTIERS', 'AGRICULTURE', 'BUSINESS', 'SANTÉ', 'TECH'].map(cat => (
                 <button key={cat} className="px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 whitespace-nowrap transition-colors">
                     {cat}
                 </button>
             ))}
          </div>
      </header>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {COURSES.map(course => {
            // Check enrollment from local state logic (simplified here as state is at top level, 
            // in real app we'd pass enrollment down or use context)
            // For now, we rely on the detail view to handle enrollment check.
            return (
              <button 
                key={course.id} 
                onClick={() => setActiveCourse(course)}
                className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-slate-100 text-left group flex flex-col h-full"
              >
                <div className="h-40 bg-brand-dark relative overflow-hidden">
                   <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10"/>
                   <div className="absolute bottom-4 left-4 z-20">
                       <span className="px-2 py-1 bg-brand-gold text-brand-dark text-[10px] font-bold rounded uppercase tracking-wider mb-1 inline-block">
                           {course.faculty}
                       </span>
                       <h3 className="text-lg font-bold text-white leading-tight group-hover:text-brand-gold transition-colors">{course.title}</h3>
                   </div>
                   <GraduationCap className="absolute top-4 right-4 text-white/10 w-24 h-24 transform rotate-12 group-hover:scale-110 transition-transform duration-500" />
                </div>
                
                <div className="p-5 flex-1 flex flex-col">
                  <p className="text-slate-600 text-sm mb-4 line-clamp-2">{course.description}</p>
                  
                  <div className="mt-auto flex items-center justify-between text-xs font-medium text-slate-500 border-t pt-4 border-slate-100">
                    <div className="flex items-center gap-1">
                        <Video size={14} /> {course.modules.length} modules
                    </div>
                    <div className="flex items-center gap-1 text-brand-accent">
                        Voir le cours <ChevronRight size={14} />
                    </div>
                  </div>
                </div>
              </button>
            )
        })}
      </div>
    </div>
  );
};