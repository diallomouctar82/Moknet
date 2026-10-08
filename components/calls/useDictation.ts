import { useRef, useState } from 'react';

/**
 * Dictée vocale du navigateur (Web Speech API). `locale` null = langue non
 * reconnue par le navigateur : l'interface propose alors la saisie écrite.
 */
export const useDictation = (locale: string | null, onText: (text: string) => void) => {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const SR = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
  const available = !!SR && !!locale;

  const toggle = () => {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    if (!SR) { setError('Dictée non prise en charge par ce navigateur : écrivez votre texte.'); return; }
    if (!locale) { setError('Dictée indisponible dans cette langue : écrivez votre texte.'); return; }
    const rec = new SR();
    rec.lang = locale;
    rec.interimResults = false;
    rec.onstart = () => { setListening(true); setError(null); };
    rec.onend = () => setListening(false);
    rec.onerror = (e: any) => { setListening(false); setError(`Dictée interrompue (${e?.error ?? 'erreur'})`); };
    rec.onresult = (e: any) => {
      const text = Array.from(e.results as ArrayLike<any>).map((r: any) => r[0]?.transcript ?? '').join(' ').trim();
      if (text) onText(text);
    };
    recRef.current = rec;
    rec.start();
  };

  return { listening, available, error, toggle };
};
