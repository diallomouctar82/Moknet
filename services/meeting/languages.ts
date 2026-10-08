// Matrice des langues réellement prises en charge par la chaîne MokNet.
//
// Chaque capacité dépend d'un composant précis :
// - dictation : reconnaissance vocale du navigateur (Web Speech API, Chrome).
// - voice     : voix synthétique de l'expert en appel (Gemini Live, voix natives).
// - captions  : sous-titres traduits (traduction texte Gemini).
//
// "stable" = langue listée publiquement par le fournisseur du composant.
// "experimental" = le fournisseur produit du texte, mais la qualité n'a pas été
// mesurée : l'interface l'affiche comme expérimental.
// Aucune de ces capacités n'a été vérifiée avec une vraie clé API dans le dépôt :
// voir docs/APPELS_MULTI_PARTICIPANTS.md, section "Bloqué avant production".

export type LangCode = 'fr' | 'en' | 'es' | 'ar' | 'sw' | 'wo' | 'ff' | 'man' | 'ln';

export type SupportTier = 'stable' | 'experimental' | 'none';

export interface LanguageCapabilities {
  code: LangCode;
  name: string;          // nom natif affiché
  englishName: string;   // nom transmis au modèle de traduction
  dictation: string | null; // code BCP-47 pour SpeechRecognition, null si non pris en charge
  voice: boolean;        // l'expert peut répondre à la voix dans cette langue
  captions: SupportTier; // sous-titres traduits
}

export const LANGUAGE_MATRIX: LanguageCapabilities[] = [
  { code: 'fr', name: 'Français', englishName: 'French', dictation: 'fr-FR', voice: true, captions: 'stable' },
  { code: 'en', name: 'English', englishName: 'English', dictation: 'en-US', voice: true, captions: 'stable' },
  { code: 'es', name: 'Español', englishName: 'Spanish', dictation: 'es-ES', voice: true, captions: 'stable' },
  { code: 'ar', name: 'العربية', englishName: 'Arabic', dictation: 'ar-SA', voice: true, captions: 'stable' },
  { code: 'sw', name: 'Kiswahili', englishName: 'Swahili', dictation: 'sw-KE', voice: false, captions: 'stable' },
  { code: 'wo', name: 'Wolof', englishName: 'Wolof', dictation: null, voice: false, captions: 'experimental' },
  { code: 'ff', name: 'Pulaar', englishName: 'Fula (Pulaar)', dictation: null, voice: false, captions: 'experimental' },
  { code: 'man', name: 'Malinké', englishName: 'Mandinka (Malinke)', dictation: null, voice: false, captions: 'experimental' },
  { code: 'ln', name: 'Lingala', englishName: 'Lingala', dictation: null, voice: false, captions: 'experimental' },
];

export const DEFAULT_LANG: LangCode = 'fr';

export const getLanguage = (code: string | undefined | null): LanguageCapabilities | undefined =>
  LANGUAGE_MATRIX.find(l => l.code === code);

export const isSupportedLang = (code: string | undefined | null): code is LangCode =>
  !!getLanguage(code);

/** Langues proposables comme langue d'écoute : toutes celles qui ont des sous-titres. */
export const listenableLanguages = (includeExperimental = true): LanguageCapabilities[] =>
  LANGUAGE_MATRIX.filter(l => l.captions === 'stable' || (includeExperimental && l.captions === 'experimental'));

/** Code BCP-47 de dictée, ou null si le navigateur ne sait pas reconnaître cette langue. */
export const dictationLocale = (code: string | undefined | null): string | null =>
  getLanguage(code)?.dictation ?? null;

export const languageLabel = (code: string | undefined | null): string => {
  const l = getLanguage(code);
  if (!l) return String(code ?? '?');
  return l.captions === 'experimental' ? `${l.name} (expérimental)` : l.name;
};
