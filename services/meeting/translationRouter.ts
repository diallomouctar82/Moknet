// Routage des traductions pendant un appel : une seule traduction par langue
// d'écoute distincte (et non par participant), avec cache, délai maximal et
// repli explicite (texte original affiché, statut "failed") en cas d'échec.

import { getLanguage, LangCode } from './languages';
import { Caption } from './types';

export interface Translator {
  translate(text: string, from: LangCode, to: LangCode, signal?: AbortSignal): Promise<string>;
}

export interface RouterOptions { timeoutMs?: number; cacheSize?: number; onError?: (e: unknown, info: { from: LangCode; to: LangCode }) => void }

export class TranslationRouter {
  private cache = new Map<string, string>();
  private timeoutMs: number;
  private cacheSize: number;
  public stats = { requests: 0, cacheHits: 0, failures: 0 };

  constructor(private translator: Translator, private opts: RouterOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 6000;
    this.cacheSize = opts.cacheSize ?? 500;
  }

  private async one(text: string, from: LangCode, to: LangCode): Promise<string> {
    const key = `${from}>${to}:${text}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) { this.stats.cacheHits++; return hit; }
    this.stats.requests++;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { ctrl.abort(); reject(new Error(`Traduction ${from}→${to} : délai de ${this.timeoutMs} ms dépassé`)); }, this.timeoutMs);
    });
    try {
      const out = (await Promise.race([this.translator.translate(text, from, to, ctrl.signal), timeout])).trim();
      if (!out) throw new Error('Traduction vide');
      this.cache.set(key, out);
      if (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value as string);
      return out;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Traduit `text` vers chaque langue cible (sans doublon, sans la langue source). */
  async translateAll(text: string, from: LangCode, targets: LangCode[]): Promise<Caption['translations']> {
    const unique = Array.from(new Set(targets)).filter(t => t !== from);
    const entries = await Promise.all(unique.map(async (to) => {
      const experimental = getLanguage(to)?.captions === 'experimental';
      try {
        return [to, { status: 'ok' as const, text: await this.one(text, from, to), experimental }] as const;
      } catch (e) {
        this.stats.failures++;
        this.opts.onError?.(e, { from, to });
        return [to, { status: 'failed' as const, experimental }] as const;
      }
    }));
    return Object.fromEntries(entries);
  }
}
