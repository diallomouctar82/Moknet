import { ExpertType } from '../../types';
import { LangCode } from './languages';
import { ExpertMeetingRole } from './types';

/** Experts MokNet invitables dans un appel, avec les rôles de collaboration qu'ils savent tenir. */
export const EXPERT_DIRECTORY: Array<{
  type: ExpertType; name: string; domain: string; color: string; roles: ExpertMeetingRole[];
}> = [
  { type: ExpertType.DIALLO, name: 'Diallo', domain: 'Communication & langues', color: 'bg-blue-600', roles: ['ADVISOR', 'NOTE_TAKER', 'LIVE_RECAP'] },
  { type: ExpertType.MAITRE, name: 'Maître Diallo', domain: 'Juridique', color: 'bg-red-700', roles: ['ADVISOR', 'NOTE_TAKER', 'LIVE_RECAP'] },
  { type: ExpertType.DOCTEUR, name: 'Dr. Diallo', domain: 'Santé & prévention', color: 'bg-green-600', roles: ['ADVISOR', 'NOTE_TAKER', 'LIVE_RECAP'] },
  { type: ExpertType.PROFESSEUR, name: 'Prof. Diallo', domain: 'Éducation', color: 'bg-yellow-600', roles: ['ADVISOR', 'NOTE_TAKER', 'LIVE_RECAP'] },
  { type: ExpertType.CONSEILLER, name: 'Conseiller Diallo', domain: 'Emploi & business', color: 'bg-purple-600', roles: ['ADVISOR', 'NOTE_TAKER', 'LIVE_RECAP'] },
  { type: ExpertType.MONSIEUR, name: 'M. Diallo', domain: 'Logement', color: 'bg-orange-600', roles: ['ADVISOR', 'NOTE_TAKER', 'LIVE_RECAP'] },
  { type: ExpertType.GUIDE, name: 'Guide Diallo', domain: 'Voyage & mobilité', color: 'bg-sky-500', roles: ['ADVISOR', 'NOTE_TAKER', 'LIVE_RECAP'] },
];

/**
 * Annuaire de démonstration. MokNet n'a pas encore d'annuaire d'utilisateurs
 * côté serveur : en production, cette liste doit venir du backend (voir docs).
 */
export const DEMO_PEOPLE: Array<{ id: string; name: string; lang: LangCode; city: string }> = [
  { id: 'moussa', name: 'Moussa D.', lang: 'fr', city: 'Conakry' },
  { id: 'aminata', name: 'Aminata K.', lang: 'en', city: 'Accra' },
  { id: 'jeanpierre', name: 'Jean-Pierre M.', lang: 'es', city: 'Malabo' },
  { id: 'fatou', name: 'Fatou S.', lang: 'wo', city: 'Dakar' },
  { id: 'kofi', name: 'Kofi A.', lang: 'sw', city: 'Nairobi' },
];

export const findDemoPerson = (id: string | null | undefined) => DEMO_PEOPLE.find(p => p.id === id);
