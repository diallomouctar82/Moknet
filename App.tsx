
import React, { useState, useEffect } from 'react';
import { DialloAssistants } from './components/DialloAssistants';
import { SocialFeed } from './components/SocialFeed';
import { MokSchool } from './components/MokSchool';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthPage } from './components/AuthPage';
import { CallsHub } from './components/calls/CallsHub';
import { AppView, UserProfile } from './types';
import { MessageSquare, Users, GraduationCap, Menu, ShieldCheck, LogOut, CreditCard, X, Check, Zap, Home, Smartphone, QrCode, Copy, Loader2, PhoneCall } from 'lucide-react';

const App: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!localStorage.getItem('mok_auth_token');
  });

  // ?view=calls ouvre directement les appels (lien d'invitation, démonstration multi-onglets).
  const [currentView, setCurrentView] = useState<AppView>(() =>
    new URLSearchParams(window.location.search).get('view') === 'calls' ? AppView.CALLS : AppView.ASSISTANTS);
  const [showShop, setShowShop] = useState(false);
  
  // Payment State
  const [showPayment, setShowPayment] = useState(false);
  const [selectedPack, setSelectedPack] = useState<{title: string, credits: number, price: number} | null>(null);
  const [paymentStep, setPaymentStep] = useState<'METHOD' | 'ORANGE_MONEY' | 'PROCESSING' | 'SUCCESS'>('METHOD');
  const [transactionId, setTransactionId] = useState('');
  
  // Credit State
  const [userCredits, setUserCredits] = useState<number>(() => {
      const saved = localStorage.getItem('mok_user_profile');
      if (saved) {
          try {
              const p = JSON.parse(saved);
              return p.subscription?.credits || 10;
          } catch(e) { return 10; }
      }
      return 10;
  });

  const updateCredits = (newAmount: number) => {
      setUserCredits(newAmount);
      const saved = localStorage.getItem('mok_user_profile');
      if (saved) {
          const p = JSON.parse(saved);
          if (!p.subscription) p.subscription = { plan: 'FREE', isActive: true };
          p.subscription.credits = newAmount;
          localStorage.setItem('mok_user_profile', JSON.stringify(p));
      }
  };

  const deductCredits = (amount: number): boolean => {
      if (userCredits >= amount) {
          updateCredits(userCredits - amount);
          return true;
      }
      setShowShop(true);
      return false;
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('mok_auth_token');
    setIsAuthenticated(false);
    setCurrentView(AppView.ASSISTANTS);
  };

  const initiatePayment = (pack: {title: string, credits: number, price: number}) => {
      setSelectedPack(pack);
      setShowShop(false);
      setShowPayment(true);
      setPaymentStep('ORANGE_MONEY'); // Defaulting to OM for this update
      setTransactionId('');
  };

  const confirmPayment = () => {
      if (!transactionId) return;
      setPaymentStep('PROCESSING');
      
      // Simulate API verification of Orange Money Transaction
      setTimeout(() => {
          if (selectedPack) {
              updateCredits(userCredits + selectedPack.credits);
          }
          setPaymentStep('SUCCESS');
      }, 2000);
  };

  const closePayment = () => {
      setShowPayment(false);
      setPaymentStep('METHOD');
  };

  if (!isAuthenticated) {
    return <AuthPage onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-[#F8FAFC] font-sans text-slate-900 overflow-hidden selection:bg-brand-gold/30">
      
      {/* DESKTOP SIDEBAR (Hidden on Mobile) */}
      <aside className="hidden md:flex flex-col w-72 glass-dark text-white z-50 transition-all duration-300 shadow-2xl">
        <div className="p-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-brand-gold flex items-center gap-3">
              <span className="text-3xl animate-float filter drop-shadow-glow">🌍</span> LE MONDE
          </h1>
          <p className="text-[10px] text-slate-400 mt-2 pl-12 uppercase tracking-[0.2em] font-medium opacity-80">À VOUS</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-3 mt-4">
          <NavButton 
            active={currentView === AppView.ASSISTANTS} 
            onClick={() => setCurrentView(AppView.ASSISTANTS)} 
            icon={<MessageSquare size={22}/>} 
            label="Assistants IA" 
          />
          <NavButton 
            active={currentView === AppView.CALLS} 
            onClick={() => setCurrentView(AppView.CALLS)} 
            icon={<PhoneCall size={22}/>} 
            label="Appels de groupe" 
          />
          <NavButton 
            active={currentView === AppView.SOCIAL} 
            onClick={() => setCurrentView(AppView.SOCIAL)} 
            icon={<Users size={22}/>} 
            label="Réseau & Lives" 
          />
          <NavButton 
            active={currentView === AppView.SCHOOL} 
            onClick={() => setCurrentView(AppView.SCHOOL)} 
            icon={<GraduationCap size={22}/>} 
            label="Université MOK" 
          />
        </nav>

        {/* User & Credits Section */}
        <div className="p-6 border-t border-white/5 bg-black/20">
          <div className="mb-6 bg-gradient-to-br from-slate-800 to-slate-900 p-4 rounded-2xl border border-white/10 shadow-lg group hover:border-brand-gold/30 transition-colors">
             <div className="flex justify-between items-center mb-3">
                 <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Solde Actuel</span>
                 <span className="text-brand-gold font-bold text-lg drop-shadow-sm">{userCredits} 💎</span>
             </div>
             <button 
                onClick={() => setShowShop(true)}
                className="w-full py-2.5 bg-brand-gold hover:bg-[#E0900A] text-brand-dark text-xs font-bold rounded-xl transition-all shadow-md hover:shadow-glow flex items-center justify-center gap-2 group-hover:scale-[1.02]"
             >
                 <Zap size={14} fill="currentColor"/> Recharger
             </button>
          </div>

          <div className="flex items-center justify-between gap-3">
             <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-gold to-yellow-300 flex items-center justify-center font-bold text-brand-dark text-sm shadow-md ring-2 ring-white/10">U</div>
                 <div className="flex flex-col">
                    <span className="text-sm font-bold text-white">Utilisateur</span>
                    <button onClick={() => setCurrentView(AppView.ADMIN)} className="text-[10px] text-slate-400 hover:text-brand-gold text-left flex items-center gap-1 transition-colors">
                        <ShieldCheck size={10} /> Admin
                    </button>
                 </div>
             </div>
             <button 
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                title="Déconnexion"
             >
                <LogOut size={18} />
             </button>
          </div>
        </div>
      </aside>

      {/* MOBILE HEADER (Sticky & Glass) */}
      <div className="md:hidden fixed top-0 w-full glass z-40 flex justify-between items-center px-5 py-3 shadow-soft pt-safe transition-all duration-300">
        <h1 className="font-extrabold text-brand-dark flex items-center gap-2 text-lg tracking-tight">
            <span className="text-2xl filter drop-shadow-sm">🌍</span> MOK
        </h1>
        <div className="flex items-center gap-3">
            <button 
                onClick={() => setShowShop(true)} 
                className="bg-white/50 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border border-slate-200 text-slate-700 active:scale-95 transition-transform shadow-sm"
            >
                <span className="text-brand-gold font-extrabold">{userCredits}</span> 💎
            </button>
            <button onClick={handleLogout} className="p-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 active:scale-95 transition-all">
                <LogOut size={18} />
            </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden pt-[60px] md:pt-0 bg-[#F8FAFC]">
        <div className="flex-1 h-full overflow-hidden relative">
          {currentView === AppView.ASSISTANTS && (
              <DialloAssistants 
                  userCredits={userCredits} 
                  deductCredits={deductCredits} 
                  onOpenGroupCall={() => setCurrentView(AppView.CALLS)}
              />
          )}
          {currentView === AppView.CALLS && <CallsHub />}
          {currentView === AppView.SOCIAL && <SocialFeed />}
          {currentView === AppView.SCHOOL && (
              <MokSchool 
                  userCredits={userCredits}
                  deductCredits={deductCredits}
              />
          )}
          {currentView === AppView.ADMIN && <AdminDashboard />}
        </div>
      </main>

      {/* MOBILE BOTTOM NAV (Floating Dock) */}
      <nav className="md:hidden fixed bottom-0 w-full glass-dock flex justify-around items-center p-2 z-50 pb-safe transition-all duration-300">
        <MobileNavButton 
            active={currentView === AppView.ASSISTANTS} 
            onClick={() => setCurrentView(AppView.ASSISTANTS)} 
            icon={<MessageSquare size={24} strokeWidth={active => active ? 2.5 : 2} />} 
            label="Chat"
        />
        <MobileNavButton 
            active={currentView === AppView.CALLS} 
            onClick={() => setCurrentView(AppView.CALLS)} 
            icon={<PhoneCall size={24} />} 
            label="Appels"
        />
        <MobileNavButton 
            active={currentView === AppView.SOCIAL} 
            onClick={() => setCurrentView(AppView.SOCIAL)} 
            icon={<Users size={24} strokeWidth={active => active ? 2.5 : 2} />} 
            label="Social"
        />
        <div className="relative -top-5">
            <button 
                onClick={() => setCurrentView(AppView.SCHOOL)}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-glow transition-all duration-300 ${currentView === AppView.SCHOOL ? 'bg-brand-gold text-white scale-110' : 'bg-brand-dark text-white'}`}
            >
                <GraduationCap size={24} fill={currentView === AppView.SCHOOL ? "currentColor" : "none"} />
            </button>
        </div>
        
        <MobileNavButton 
            active={currentView === AppView.ADMIN} 
            onClick={() => setCurrentView(AppView.ADMIN)} 
            icon={<ShieldCheck size={24} strokeWidth={active => active ? 2.5 : 2} />} 
            label="Admin"
        />
        <MobileNavButton 
             active={false}
             onClick={() => setShowShop(true)}
             icon={<CreditCard size={24} />}
             label="Shop"
        />
      </nav>

      {/* CREDIT SHOP MODAL */}
      {showShop && (
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in duration-300">
              <div className="absolute inset-0" onClick={() => setShowShop(false)}></div>
              
              <div className="bg-white rounded-t-[2rem] md:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl transform transition-transform animate-slide-up relative z-10">
                  <div className="bg-brand-dark p-8 text-white text-center relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-full bg-brand-gold opacity-10 blur-xl"></div>
                      <button onClick={() => setShowShop(false)} className="absolute top-4 right-4 text-white/50 hover:text-white p-2 bg-white/10 rounded-full transition-colors">
                          <X size={20} />
                      </button>
                      <h2 className="text-2xl font-bold relative z-10 flex items-center justify-center gap-2">
                          <CreditCard className="text-brand-gold" /> Boutique
                      </h2>
                      <p className="text-slate-300 text-sm mt-2 relative z-10">Rechargez vos crédits pour tout débloquer</p>
                  </div>
                  
                  <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                      <ShopItem 
                        icon="🥉" title="Pack Découverte" credits={50} price={5000} color="bg-blue-50 border-blue-100" 
                        onClick={() => initiatePayment({title: 'Pack Découverte', credits: 50, price: 5000})} 
                      />
                      <ShopItem 
                        icon="🥇" title="Pack Premium" credits={200} price={15000} color="bg-yellow-50 border-yellow-100 ring-2 ring-brand-gold/20" popular 
                        onClick={() => initiatePayment({title: 'Pack Premium', credits: 200, price: 15000})} 
                      />
                      <ShopItem 
                        icon="🚀" title="Pack Business" credits={500} price={30000} color="bg-purple-50 border-purple-100" 
                        onClick={() => initiatePayment({title: 'Pack Business', credits: 500, price: 30000})} 
                      />
                  </div>
              </div>
          </div>
      )}

      {/* ORANGE MONEY PAYMENT MODAL */}
      {showPayment && selectedPack && (
          <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
              <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative">
                  <button onClick={closePayment} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 bg-slate-100 rounded-full z-20">
                      <X size={20} />
                  </button>

                  {/* Header */}
                  <div className="bg-black p-6 pb-8 relative overflow-hidden">
                      <div className="absolute -right-4 -top-4 w-32 h-32 bg-[#FF7900] rounded-full blur-3xl opacity-50"></div>
                      <h2 className="text-white font-bold text-xl relative z-10 flex items-center gap-2">
                         <span className="w-8 h-8 bg-[#FF7900] rounded flex items-center justify-center font-extrabold text-black">OM</span> Orange Money
                      </h2>
                  </div>

                  <div className="px-6 py-6 -mt-4 bg-white rounded-t-3xl relative z-10">
                      
                      {/* Step 1: Payment Instructions */}
                      {paymentStep === 'ORANGE_MONEY' && (
                          <div className="space-y-6">
                              <div className="text-center">
                                  <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Bénéficiaire</p>
                                  <h3 className="text-xl font-extrabold text-slate-900">VISION SMART SARLU</h3>
                                  <div className="flex items-center justify-center gap-2 mt-2">
                                      <span className="bg-slate-100 px-3 py-1 rounded-full text-sm font-mono font-bold text-slate-600">374081</span>
                                      <button className="text-brand-accent hover:text-blue-700" title="Copier"><Copy size={16}/></button>
                                  </div>
                              </div>

                              <div className="bg-[#FF7900]/10 border border-[#FF7900]/20 p-4 rounded-2xl flex items-center gap-4">
                                  <div className="bg-[#FF7900] text-white p-3 rounded-xl">
                                      <Smartphone size={24} />
                                  </div>
                                  <div className="flex-1">
                                      <p className="text-xs font-bold text-[#FF7900] mb-1">CODE DE PAIEMENT</p>
                                      <p className="font-mono font-bold text-lg text-slate-800 tracking-tight">
                                          #144*6*374081*{selectedPack.price}#
                                      </p>
                                  </div>
                              </div>

                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-slate-500 ml-1">ID de Transaction (Reçu par SMS)</label>
                                  <input 
                                      type="text" 
                                      value={transactionId}
                                      onChange={(e) => setTransactionId(e.target.value)}
                                      placeholder="Ex: CI230918.1542.A12345"
                                      className="w-full p-4 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-[#FF7900] focus:ring-1 focus:ring-[#FF7900] font-mono text-sm transition-all"
                                  />
                              </div>

                              <button 
                                  onClick={confirmPayment}
                                  disabled={!transactionId}
                                  className="w-full py-4 bg-black text-white font-bold rounded-xl shadow-lg hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                              >
                                  Confirmer le paiement <Check size={18} />
                              </button>
                          </div>
                      )}

                      {/* Step 2: Processing */}
                      {paymentStep === 'PROCESSING' && (
                          <div className="py-12 text-center space-y-4">
                              <Loader2 size={48} className="animate-spin text-[#FF7900] mx-auto" />
                              <h3 className="font-bold text-lg text-slate-800">Vérification en cours...</h3>
                              <p className="text-slate-500 text-sm">Nous vérifions votre transaction avec Orange Money.</p>
                          </div>
                      )}

                      {/* Step 3: Success */}
                      {paymentStep === 'SUCCESS' && (
                          <div className="py-8 text-center space-y-6">
                              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600 animate-in zoom-in duration-300">
                                  <Check size={40} strokeWidth={4} />
                              </div>
                              <div>
                                  <h3 className="font-extrabold text-2xl text-slate-900 mb-2">Paiement Réussi !</h3>
                                  <p className="text-slate-600">
                                      <span className="font-bold text-brand-gold">+{selectedPack.credits} Crédits</span> ajoutés à votre compte.
                                  </p>
                              </div>
                              <button 
                                  onClick={closePayment}
                                  className="w-full py-3 bg-brand-dark text-white font-bold rounded-xl hover:scale-105 transition-transform"
                              >
                                  Continuer
                              </button>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl transition-all duration-300 group ${
      active 
        ? 'bg-gradient-to-r from-brand-gold to-yellow-600 text-brand-dark font-bold shadow-lg scale-105' 
        : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`}
  >
    <div className={`transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>{icon}</div>
    <span className="tracking-wide text-sm">{label}</span>
  </button>
);

const MobileNavButton = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center p-2 w-full transition-all duration-300 active:scale-90 ${
      active ? 'text-brand-dark' : 'text-slate-400'
    }`}
  >
    <div className={`mb-1 transition-all duration-300 ${active ? '-translate-y-1 text-brand-gold drop-shadow-sm' : ''}`}>
        {typeof icon === 'function' ? icon(active) : icon}
    </div>
    <span className={`text-[10px] font-bold transition-opacity duration-300 ${active ? 'opacity-100 text-brand-dark' : 'opacity-0 h-0 hidden'}`}>{label}</span>
  </button>
);

const ShopItem = ({ icon, title, credits, price, color, popular, onClick }: any) => (
    <div 
        onClick={onClick}
        className={`${color} p-4 rounded-2xl border flex items-center justify-between active:scale-95 transition-all cursor-pointer relative overflow-hidden shadow-sm hover:shadow-md`}
    >
        {popular && <div className="absolute top-0 right-0 bg-brand-gold text-brand-dark text-[9px] font-bold px-3 py-1 rounded-bl-xl shadow-sm">POPULAIRE</div>}
        <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/80 rounded-full flex items-center justify-center text-2xl shadow-sm">{icon}</div>
            <div>
                <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{credits} Crédits</p>
            </div>
        </div>
        <button className="bg-brand-dark text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg transform active:scale-95 transition-transform">
            {price.toLocaleString()} GNF
        </button>
    </div>
);

export default App;
