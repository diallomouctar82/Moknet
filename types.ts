
export enum ExpertType {
  DIALLO = 'DIALLO', // Langues
  MAITRE = 'MAITRE', // Juridique
  CONSEILLER = 'CONSEILLER', // Emploi
  PROFESSEUR = 'PROFESSEUR', // Education
  DOCTEUR = 'DOCTEUR', // Santé
  MONSIEUR = 'MONSIEUR', // Logement
  GUIDE = 'GUIDE' // Voyage
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string; // base64
  groundingUrls?: Array<{title: string, url: string}>;
  isThinking?: boolean;
}

export interface CourseModule {
  id: string;
  title: string;
  duration: string;
  type: 'theory' | 'secret' | 'practice';
  isLocked: boolean;
}

export interface Instructor {
  id: string;
  name: string;
  title: string;
  avatar: string;
  bio: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  faculty: string;
  level: string;
  image?: string;
  instructor?: Instructor;
  modules: CourseModule[];
}

export interface LiveStream {
  id: string;
  title: string;
  host: string;
  expertType: ExpertType;
  category: string;
  viewers: number;
  thumbnailColor: string;
  isUserGenerated?: boolean;
  coHost?: ExpertType;
}

export interface SocialPost {
  id: string;
  user: string;
  content: string;
  videoUrl?: string;
  imageUrl?: string;
  likes: number;
  isLive?: boolean;
}

export interface MokBadge {
  id: string;
  name: string;
  icon: string;
  date: string;
  level: 'Novice' | 'Intermédiaire' | 'Expert';
  faculty: string;
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  year: string;
}

export interface Experience {
  id: string;
  company: string;
  role: string;
  duration: string;
  description: string;
}

export interface Language {
  name: string;
  level: string;
}

// --- NEW SUBSCRIPTION TYPES ---
export type SubscriptionPlan = 'FREE' | 'PREMIUM' | 'GOLD';

export interface UserSubscription {
  plan: SubscriptionPlan;
  credits: number;
  expiryDate?: string;
  isActive: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  title: string;
  location: string;
  avatar: string;
  skills: string[];
  interests: string[];
  mokBadges: MokBadge[];
  aiSummary: string;
  languages: Language[];
  education: Education[];
  experience: Experience[];
  subscription: UserSubscription; // Linked Subscription
}

// --- NEW ADMIN & VOICE TYPES ---
export enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN', // Can manage other admins (visionsmart224@gmail.com)
  GLOBAL_ADMIN = 'GLOBAL_ADMIN',
  CONTENT_MANAGER = 'CONTENT_MANAGER',
  AGENT_MANAGER = 'AGENT_MANAGER'
}

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  addedBy: string;
  lastActive: string;
}

export interface VoiceModel {
  id: string;
  name: string;
  source: 'CLONED' | 'PREBUILT';
  assignedTo?: ExpertType;
  previewUrl?: string; // Optional URL for audio preview
}

export enum AppView {
  ASSISTANTS = 'ASSISTANTS',
  CALLS = 'CALLS',
  SOCIAL = 'SOCIAL',
  SCHOOL = 'SCHOOL',
  ADMIN = 'ADMIN'
}
