import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage } from '../../services/meeting/conversationStore';

// localStorage minimal pour les surcharges de consignes de l'administration.
(globalThis as any).localStorage = new MemoryStorage();

const { getSystemInstruction, buildMeetingExpertInstruction, BASE_INSTRUCTION, LANGUAGE_POLICY, saveSystemInstruction, EXPERT_PROFILES } = await import('../../services/geminiService');
const { ExpertType } = await import('../../types');

describe('consignes des experts : plus de réponses uniquement en français', () => {
  beforeEach(() => { (globalThis as any).localStorage = new MemoryStorage(); });

  it('n\'impose plus le français par défaut', () => {
    expect(BASE_INSTRUCTION).not.toMatch(/FRANÇAIS par défaut/);
    expect(getSystemInstruction(ExpertType.MAITRE)).toContain('langue de ton interlocuteur');
  });

  it('chaque expert reçoit la politique de langue, y compris M. Diallo (logement)', () => {
    for (const t of Object.values(ExpertType)) {
      const s = getSystemInstruction(t);
      expect(s).toContain(LANGUAGE_POLICY.trim());
      expect(s).toContain(EXPERT_PROFILES[t].title);
    }
    expect(getSystemInstruction(ExpertType.MONSIEUR)).toContain('logement');
  });

  it('une consigne personnalisée par l\'administration garde la politique de langue', () => {
    saveSystemInstruction(ExpertType.GUIDE, 'Tu es le guide. Réponds en français.');
    const s = getSystemInstruction(ExpertType.GUIDE);
    expect(s.startsWith('Tu es le guide.')).toBe(true);
    expect(s).toContain(LANGUAGE_POLICY.trim());
  });

  it('en appel de groupe : langue de sortie imposée, rôle explicite, transparence IA', () => {
    const s = buildMeetingExpertInstruction(ExpertType.DOCTEUR, 'NOTE_TAKER', 'Spanish');
    expect(s).toContain('Write your output in Spanish');
    expect(s).toContain('PRENEUR DE NOTES');
    expect(s).toContain('Ne prétends jamais être un humain');
    expect(s).toContain('le logiciel MokNet vérifie les calculs');
    expect(s).toContain('diagnostic');
  });
});
