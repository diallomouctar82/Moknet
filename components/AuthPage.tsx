
import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Check, Facebook, Chrome, Globe, ShieldCheck } from 'lucide-react';

interface AuthPageProps {
  onLogin: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      if (rememberMe) {
        localStorage.setItem('mok_auth_token', 'demo_token_manual');
      }
      setIsLoading(false);
      onLogin();
    }, 1500);
  };

  const handleSocialLogin = (provider: string) => {
     setIsLoading(true);
     // Simulate Social Auth Popup/Redirect
     setTimeout(() => {
       localStorage.setItem('mok_auth_token', `social_${provider}`);
       setIsLoading(false);
       onLogin();
     }, 1000);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans">
      
      {/* Left Panel - Brand & Vision */}
      <div className="md:w-1/2 bg-brand-dark text-white p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-dark via-slate-900 to-blue-900 z-0"></div>
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] z-0"></div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 text-brand-gold mb-8">
            <Globe size={32} />
            <h1 className="text-2xl font-bold tracking-wider">LE MONDE À VOUS</h1>
          </div>
          
          <div className="space-y-6 max-w-md">
            <h2 className="text-4xl md:text-5xl font-bold leading-tight">
              {isLogin ? "Ravi de vous revoir." : "Rejoignez la révolution."}
            </h2>
            <p className="text-slate-300 text-lg leading-relaxed">
              Accédez à une éducation mondiale, des assistants IA experts et un réseau social qui change des vies.
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-12 md:mt-0">
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <div className="flex items-center gap-1">
               <ShieldCheck size={16} className="text-green-500" /> Sécurisé
            </div>
            <span>•</span>
            <span>100% Gratuit</span>
            <span>•</span>
            <span>195 Pays</span>
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="md:w-1/2 flex items-center justify-center p-6 md:p-12 bg-white">
        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
          
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-bold text-slate-900">
              {isLogin ? "Connexion à votre compte" : "Créer un nouveau compte"}
            </h2>
            <p className="text-slate-500 mt-2">
              {isLogin ? "Entrez vos identifiants pour continuer." : "Remplissez le formulaire pour commencer."}
            </p>
          </div>

          {/* Social Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => handleSocialLogin('google')}
              className="flex items-center justify-center gap-2 py-3 px-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors font-medium text-slate-700"
            >
              <Chrome size={20} className="text-red-500" />
              <span className="text-sm">Google</span>
            </button>
            <button 
              onClick={() => handleSocialLogin('facebook')}
              className="flex items-center justify-center gap-2 py-3 px-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors font-medium text-slate-700"
            >
              <Facebook size={20} className="text-blue-600" />
              <span className="text-sm">Facebook</span>
            </button>
          </div>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-xs uppercase font-bold">Ou avec email</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Manual Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Adresse Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail size={20} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-accent focus:border-brand-accent transition-colors outline-none text-slate-900 bg-slate-50/50 focus:bg-white"
                  placeholder="exemple@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Mot de passe</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock size={20} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-accent focus:border-brand-accent transition-colors outline-none text-slate-900 bg-slate-50/50 focus:bg-white"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${rememberMe ? 'bg-brand-dark border-brand-dark text-white' : 'border-slate-300 bg-white'}`}>
                  {rememberMe && <Check size={14} />}
                </div>
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={rememberMe} 
                  onChange={() => setRememberMe(!rememberMe)} 
                />
                <span className="text-sm text-slate-600">Se souvenir de moi</span>
              </label>
              
              {isLogin && (
                <button type="button" className="text-sm text-brand-accent font-medium hover:underline">
                  Mot de passe oublié ?
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-brand-dark text-white rounded-xl font-bold text-base hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Traitement...
                </>
              ) : (
                <>
                  {isLogin ? "Se Connecter" : "Créer mon Compte"} <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>

          <div className="text-center text-sm text-slate-500">
            {isLogin ? "Pas encore de compte ?" : "Déjà un compte ?"}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="ml-2 font-bold text-brand-gold hover:underline focus:outline-none"
            >
              {isLogin ? "Inscrivez-vous gratuitement" : "Connectez-vous"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
