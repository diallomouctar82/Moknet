import { describe, it, expect } from 'vitest';
import { TranslationRouter } from '../../services/meeting/translationRouter';
import { ConversationStore, MemoryStorage } from '../../services/meeting/conversationStore';
import { listenableLanguages, dictationLocale, getLanguage } from '../../services/meeting/languages';
import { FakeTranslator } from './helpers';

describe('routeur de traduction', () => {
  it('dédoublonne les langues, saute la langue source et met en cache', async () => {
    const tr = new FakeTranslator();
    const r = new TranslationRouter(tr);
    const out = await r.translateAll('Bonjour', 'fr', ['en', 'en', 'fr', 'es']);
    expect(Object.keys(out).sort()).toEqual(['en', 'es']);
    expect(tr.calls).toHaveLength(2);
    await r.translateAll('Bonjour', 'fr', ['en']);
    expect(tr.calls).toHaveLength(2);
    expect(r.stats.cacheHits).toBe(1);
  });
  it('échoue proprement après le délai maximal', async () => {
    const tr = new FakeTranslator();
    tr.delayMs = 200;
    const r = new TranslationRouter(tr, { timeoutMs: 20 });
    const out = await r.translateAll('Bonjour', 'fr', ['en']);
    expect(out.en).toMatchObject({ status: 'failed' });
    expect(r.stats.failures).toBe(1);
  });
  it('marque les langues expérimentales', async () => {
    const out = await new TranslationRouter(new FakeTranslator()).translateAll('Bonjour', 'fr', ['wo']);
    expect(out.wo).toMatchObject({ status: 'ok', experimental: true });
  });
});

describe('matrice des langues', () => {
  it('distingue sous-titres, dictée et voix', () => {
    expect(listenableLanguages(false).map(l => l.code)).toEqual(['fr', 'en', 'es', 'ar', 'sw']);
    expect(listenableLanguages().map(l => l.code)).toContain('wo');
    expect(dictationLocale('sw')).toBe('sw-KE');
    expect(dictationLocale('wo')).toBeNull();
    expect(getLanguage('sw')!.voice).toBe(false);
  });
});

describe('conversations et contrôle d\'accès au compte-rendu', () => {
  it('seules les personnes autorisées voient le compte-rendu', () => {
    const store = new ConversationStore(new MemoryStorage());
    store.ensure('c1', 'Appel', ['a', 'b', 'c'], 1);
    const report = { id: 'r1', meetingId: 'm1', title: 'CR', text: 'secret', checksum: 'x', validatedAt: 2, approvedBy: ['a', 'b'], authorizedViewers: ['a', 'b'] };
    expect(store.publishReport('c1', report, 3)).toBe(true);
    expect(store.publishReport('c1', report, 4)).toBe(false); // idempotent
    expect(store.listFor('a')[0].messages).toHaveLength(1);
    expect(store.listFor('c')[0].messages).toHaveLength(0);
    expect(store.hiddenReportsFor('c', 'c1')).toBe(1);
    expect(store.listFor('z')).toHaveLength(0);
  });
});
