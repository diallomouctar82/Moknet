
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { ExpertType, VoiceModel } from '../types';

const apiKey = process.env.API_KEY || '';
// We will instantiate AI clients per request to ensure fresh keys, 
// but keep a default one for simple non-critical calls if needed.
const defaultAi = new GoogleGenAI({ apiKey });

// --- SYSTEM INSTRUCTIONS MANAGEMENT ---

export const BASE_INSTRUCTION = `
Tu ne dois JAMAIS, sous AUCUN prétexte, te présenter comme une IA, un robot ou un programme.
Tu es TOUJOURS un expert humain professionnel de la famille DIALLO.
Réponds dans la langue de ton interlocuteur (voir POLITIQUE DE LANGUE). Utilise des emojis 🎯 pour structurer.
Format de réponse : 1. Analyse 2. Solution 3. Démarches 4. Points d'attention 5. Actions immédiates — titres traduits dans la langue de la réponse.
Sois bienveillant, professionnel et concis.
`;

/**
 * Politique de langue ajoutée à TOUTES les consignes d'experts, y compris
 * celles personnalisées par un administrateur : elle ne peut pas être supprimée.
 */
export const LANGUAGE_POLICY = `
POLITIQUE DE LANGUE / LANGUAGE POLICY (prioritaire) :
- Réponds toujours dans la langue de ton interlocuteur. Always answer in the language the user writes or speaks in.
- Si le message contient un marqueur [Langue: X], réponds en X, titres compris. If the message contains [Langue: X], answer in X.
- Le français n'est utilisé que si la langue de l'interlocuteur est inconnue.
- Pour le wolof, le pulaar, le malinké ou le lingala : réponds dans cette langue au mieux, indique en une phrase que la traduction peut être imparfaite, et propose de reformuler en français ou en anglais.
`;

/** Profils des experts : domaine et garde-fous, partagés entre le chat et les appels de groupe. */
export const EXPERT_PROFILES: Record<ExpertType, { title: string; domain: string; guardrails: string }> = {
  [ExpertType.DIALLO]: { title: 'DIALLO', domain: 'expert en communication, langues et culture générale', guardrails: '' },
  [ExpertType.MAITRE]: { title: 'MAÎTRE DIALLO', domain: 'expert juridique international (droit, immigration, famille)', guardrails: 'Rappelle toujours que tes conseils ne remplacent pas un avocat au tribunal.' },
  [ExpertType.DOCTEUR]: { title: 'DOCTEUR DIALLO', domain: 'expert santé et bien-être, orienté prévention', guardrails: 'Ne pose jamais de diagnostic médical définitif et renvoie vers un médecin ou les urgences (15, 112) en cas d\'urgence.' },
  [ExpertType.PROFESSEUR]: { title: 'PROFESSEUR DIALLO', domain: 'expert éducation et pédagogie (devoirs, orientation, apprentissage)', guardrails: 'Pédagogue et patient.' },
  [ExpertType.CONSEILLER]: { title: 'CONSEILLER DIALLO', domain: 'expert emploi, carrière et entrepreneuriat (CV, entretiens, business)', guardrails: '' },
  [ExpertType.MONSIEUR]: { title: 'MONSIEUR DIALLO', domain: 'expert logement (recherche, aides au logement, droits des locataires, travaux)', guardrails: 'Renvoie vers les services sociaux ou un professionnel agréé pour les démarches engageantes.' },
  [ExpertType.GUIDE]: { title: 'GUIDE DIALLO', domain: 'expert voyage et mobilité (visas, vols, itinéraires)', guardrails: 'Rappelle que les conditions de visa doivent être vérifiées auprès du consulat.' },
};

// Helper to get overrides from localStorage
const getPromptOverride = (expert: ExpertType): string | null => {
    try {
        return localStorage.getItem(`mok_prompt_${expert}`);
    } catch (e) { return null; }
};

export const saveSystemInstruction = (expert: ExpertType, instruction: string) => {
    localStorage.setItem(`mok_prompt_${expert}`, instruction);
};

export const resetSystemInstruction = (expert: ExpertType) => {
    localStorage.removeItem(`mok_prompt_${expert}`);
};

export const getSystemInstruction = (expert: ExpertType): string => {
  const override = getPromptOverride(expert);
  if (override) return `${override}\n${LANGUAGE_POLICY}`;
  const p = EXPERT_PROFILES[expert] ?? EXPERT_PROFILES[ExpertType.DIALLO];
  return `${BASE_INSTRUCTION} Tu es ${p.title}, ${p.domain}. ${p.guardrails}\n${LANGUAGE_POLICY}`;
};

export type MeetingExpertRole = 'ADVISOR' | 'NOTE_TAKER' | 'LIVE_RECAP';

const MEETING_ROLE_RULES: Record<MeetingExpertRole, string> = {
  ADVISOR: `RÔLE : CONSEILLER. Tu ne prends la parole que lorsqu'un participant t'adresse une question.
Réponds en 2 à 4 phrases, de façon neutre envers tous les participants, sans interrompre la discussion.`,
  NOTE_TAKER: `RÔLE : PRENEUR DE NOTES. Tu ne parles jamais aux participants.
Tu relèves uniquement les décisions explicitement prises et les actions explicitement attribuées dans la transcription.
N'ajoute rien qui n'a pas été dit. Si le responsable ou l'échéance n'ont pas été dits, laisse-les vides.`,
  LIVE_RECAP: `RÔLE : RÉCAP EN DIRECT. Tu ne parles jamais aux participants.
Tu rédiges un récapitulatif factuel de la discussion en 3 à 6 puces courtes, sans opinion.`,
};

/**
 * Consignes d'un expert invité dans un appel de groupe. Contrairement au chat
 * individuel, l'expert y est toujours présenté comme une IA : plusieurs
 * personnes qui ne l'ont pas choisi l'entendent, et la prise de notes exige
 * un consentement éclairé.
 */
export const buildMeetingExpertInstruction = (expert: ExpertType, role: MeetingExpertRole, outputLanguage: string): string => {
  const p = EXPERT_PROFILES[expert] ?? EXPERT_PROFILES[ExpertType.DIALLO];
  return `Tu es ${p.title}, ${p.domain}, expert IA de MokNet invité dans un appel de groupe entre plusieurs personnes qui peuvent parler des langues différentes.
TRANSPARENCE : les participants savent que tu es un expert IA. Ne prétends jamais être un humain.
${MEETING_ROLE_RULES[role]}
LANGUE DE SORTIE : écris en ${outputLanguage}. Write your output in ${outputLanguage}.
FIABILITÉ : n'invente aucun fait, chiffre ni engagement. Signale explicitement toute information incertaine (« à vérifier »).
Ne fais pas de calcul toi-même : recopie les chiffres tels qu'ils ont été dits, le logiciel MokNet vérifie les calculs.
${p.guardrails}`;
};

// --- VOICE MODEL MANAGEMENT (SIMULATION) ---

export const getVoiceModels = (): VoiceModel[] => {
    const saved = localStorage.getItem('mok_voice_models');
    const defaults: VoiceModel[] = [
        { id: 'v1', name: 'Voix Admin (VisionSmart)', source: 'CLONED', assignedTo: ExpertType.DIALLO },
        { id: 'v2', name: 'Standard Homme', source: 'PREBUILT', assignedTo: ExpertType.MAITRE },
        { id: 'v3', name: 'Standard Femme', source: 'PREBUILT', assignedTo: ExpertType.DOCTEUR },
    ];
    return saved ? JSON.parse(saved) : defaults;
};

export const saveVoiceModel = (model: VoiceModel) => {
    const models = getVoiceModels();
    const updated = [...models, model];
    localStorage.setItem('mok_voice_models', JSON.stringify(updated));
};

export const assignVoiceToAgent = (voiceId: string, expert: ExpertType) => {
    const models = getVoiceModels();
    const updated = models.map(m => ({
        ...m,
        assignedTo: m.id === voiceId ? expert : (m.assignedTo === expert ? undefined : m.assignedTo)
    }));
    localStorage.setItem('mok_voice_models', JSON.stringify(updated));
};

// --- CHAT & TEXT GENERATION ---

export const generateResponse = async (
  expert: ExpertType,
  history: {role: string, parts: any[]}[],
  message: string,
  image?: string, // base64 without prefix
  useThinking: boolean = false,
  useGrounding: 'none' | 'search' | 'maps' = 'none'
) => {
  // Use a fresh instance to capture any env var updates
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const modelName = useThinking ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';
  
  const config: any = {
    systemInstruction: getSystemInstruction(expert),
  };

  if (useThinking) {
    config.thinkingConfig = { thinkingBudget: 1024 }; 
  } else {
    if (useGrounding === 'search') {
      config.tools = [{ googleSearch: {} }];
    } else if (useGrounding === 'maps') {
       config.tools = [{ googleMaps: {} }];
    }
  }

  const parts: any[] = [];
  if (image) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: image
      }
    });
  }
  parts.push({ text: message });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        ...history.map(h => ({ role: h.role, parts: h.parts })),
        { role: 'user', parts }
      ],
      config
    });

    let groundingUrls: Array<{title: string, url: string}> = [];
    
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web?.uri) {
          groundingUrls.push({ title: chunk.web.title || 'Source', url: chunk.web.uri });
        }
        if (chunk.maps?.uri) {
           groundingUrls.push({ title: chunk.maps.title || 'Map Location', url: chunk.maps.uri });
        }
      });
    }

    return {
      text: response.text || "Désolé, je n'ai pas pu générer de réponse.",
      groundingUrls
    };

  } catch (error) {
    console.error("Error generating response:", error);
    throw error;
  }
};

// --- PROFILE BIO GENERATION ---

export const generateProfileBio = async (userData: any) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  try {
    const languagesFormatted = userData.languages.map((l: any) => 
        typeof l === 'string' ? l : `${l.name} (${l.level})`
    ).join(', ');

    const prompt = `
      Agis comme CONSEILLER DIALLO, expert en marque personnelle.
      Rédige une biographie professionnelle courte (max 3 phrases), inspirante et dynamique pour un profil social.
      
      Données utilisateur :
      - Nom : ${userData.name}
      - Titre : ${userData.title}
      - Compétences : ${userData.skills.join(', ')}
      - Intérêts : ${userData.interests.join(', ')}
      - Langues : ${languagesFormatted}
      - Réalisations Écoles MOK : ${userData.mokBadges.map((b: any) => b.name).join(', ')}
      
      La bio doit mettre en avant l'ambition et le professionnalisme. Utilise 1 ou 2 emojis pertinents.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    return response.text || "Profil professionnel en construction...";
  } catch (error) {
    console.error("Error generating bio:", error);
    return "Impossible de générer la bio pour le moment.";
  }
};

export const enhanceExperienceDescription = async (role: string, company: string, description: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  try {
    const prompt = `
      Agis comme CONSEILLER DIALLO, expert RH.
      Réécris cette description de poste pour qu'elle soit plus impactante, professionnelle et orientée résultats (bullet points).
      
      Rôle : ${role} chez ${company}
      Description actuelle : "${description}"
      
      Format attendu : Juste le texte amélioré, sans introduction.
    `;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    return response.text;
  } catch (error) {
    console.error("Error enhancing experience:", error);
    throw error;
  }
};

// --- VIDEO GENERATION (VEO) ---

export const generateVeoVideo = async (prompt: string, aspectRatio: '16:9' | '9:16' = '16:9') => {
  // Ensure the user has selected an API key if required
  if ((window as any).aistudio && (window as any).aistudio.hasSelectedApiKey) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await (window as any).aistudio.openSelectKey();
      }
  }

  // Internal function to perform the generation with a fresh AI client
  const performGeneration = async () => {
      // ALWAYS Create a new instance right before the call to pick up the latest API Key
      const aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let operation = await aiClient.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: aspectRatio
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await aiClient.operations.getVideosOperation({operation: operation});
      }

      const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!videoUri) throw new Error("No video generated");

      const videoRes = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
      const blob = await videoRes.blob();
      return URL.createObjectURL(blob);
  };

  try {
    return await performGeneration();
  } catch (error: any) {
    console.error("Veo generation error:", error);
    
    // Check for "Requested entity was not found" (404) which often means invalid/missing project context for Veo
    if ((error.message?.includes("Requested entity was not found") || error.status === 404 || error.code === 404) && (window as any).aistudio) {
        console.log("Veo 404 detected, prompting for key re-selection...");
        await (window as any).aistudio.openSelectKey();
        // Retry once after key selection
        return await performGeneration();
    }
    throw error;
  }
};

// --- IMAGE GENERATION ---

export const generateImage = async (prompt: string, size: '1K' | '2K' | '4K' = '1K') => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: {
                parts: [{ text: prompt }]
            },
            config: {
                imageConfig: {
                    aspectRatio: "1:1",
                    imageSize: size
                }
            }
        });
        
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
        throw new Error("No image data found in response");
    } catch (e) {
        console.error("Image gen error", e);
        throw e;
    }
}

// --- LIVE API (AUDIO) ---

export const connectLiveSession = async (
  expert: ExpertType,
  onAudioData: (base64: string) => void,
  onClose: () => void,
  languageName?: string
) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  
  // Mapping Expert Type to appropriate Voice Personality
  let voiceName = 'Kore';
  switch (expert) {
      case ExpertType.MAITRE: voiceName = 'Fenrir'; break; // Authoritative, deep
      case ExpertType.DOCTEUR: voiceName = 'Puck'; break; // Calm, reassuring
      case ExpertType.PROFESSEUR: voiceName = 'Charon'; break; // Academic, clear
      case ExpertType.CONSEILLER: voiceName = 'Zephyr'; break; // Energetic, encouraging
      case ExpertType.MONSIEUR: voiceName = 'Fenrir'; break; // Solid, trustworthy
      case ExpertType.GUIDE: voiceName = 'Zephyr'; break; // Dynamic, inviting
      default: voiceName = 'Kore'; // Balanced, standard
  }

  // Inject a specific instruction for ORAL conversation
  const oralInstruction = `
    IMPORTANT: Cette interaction est un APPEL VOCAL EN DIRECT.
    - Tes réponses doivent être COURTES et CONVERSATIONNELLES (max 2-3 phrases).
    - Ne fais pas de longues listes. Pose des questions.
    - Adopte un ton chaleureux et naturel, adapté à ton personnage (${expert}).
    - Ne décris pas tes actions (ex: *sourit*), parle simplement.
    - Parle dans la langue de ton interlocuteur${languageName ? ` (langue choisie : ${languageName})` : ''} ; s'il change de langue, suis-le.
  `;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: () => {
          console.log("Live session opened");
          const source = inputAudioContext.createMediaStreamSource(stream);
          const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
          
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmBlob = createPcmBlob(inputData);
            sessionPromise.then(session => {
              session.sendRealtimeInput({ media: pcmBlob });
            });
          };
          
          source.connect(scriptProcessor);
          scriptProcessor.connect(inputAudioContext.destination);
        },
        onmessage: (msg: LiveServerMessage) => {
          const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) {
            onAudioData(audioData);
          }
        },
        onclose: () => {
          console.log("Live session closed");
          onClose();
          inputAudioContext.close();
          stream.getTracks().forEach(t => t.stop());
        },
        onerror: (err) => {
          console.error("Live session error", err);
          onClose();
        }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } }
        },
        systemInstruction: getSystemInstruction(expert) + oralInstruction
      }
    });

    return sessionPromise;

  } catch (err) {
    console.error("Failed to start live session", err);
    throw err;
  }
};

function createPcmBlob(data: Float32Array) {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return {
    data: btoa(binary),
    mimeType: 'audio/pcm;rate=16000'
  };
}

export async function decodeAudioData(base64: string, ctx: AudioContext) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const dataInt16 = new Int16Array(bytes.buffer);
  const frameCount = dataInt16.length;
  const buffer = ctx.createBuffer(1, frameCount, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}


// --- APPELS DE GROUPE : TRADUCTION ET EXPERTS ---

export const hasGeminiKey = (): boolean => !!process.env.API_KEY;

/** Traduction d'une intervention ou d'un élément de l'espace partagé. */
export const translateText = async (text: string, fromLanguage: string, toLanguage: string, signal?: AbortSignal): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Translate the following text from ${fromLanguage} to ${toLanguage}.
Output only the translation, without quotes or comments. Keep names, numbers, amounts and dates exactly as written.

${text}`,
    config: { temperature: 0, abortSignal: signal },
  });
  return (response.text || '').trim();
};

/** Réponse d'un expert conseiller sollicité pendant un appel. */
export const meetingExpertAnswer = async (
  expert: ExpertType, outputLanguage: string, question: string, transcript: Array<{ speaker: string; text: string }>,
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const context = transcript.length
    ? `Transcription consentie de l'appel :\n${transcript.slice(-30).map(l => `${l.speaker}: ${l.text}`).join('\n')}\n\n`
    : '';
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `${context}Question : ${question}`,
    config: { systemInstruction: buildMeetingExpertInstruction(expert, 'ADVISOR', outputLanguage) },
  });
  return (response.text || '').trim();
};

/** Extraction des décisions et actions (preneur de notes), au format JSON. */
export const meetingExpertNotes = async (
  expert: ExpertType, outputLanguage: string, transcript: Array<{ speaker: string; text: string }>,
): Promise<Array<{ section: 'decisions' | 'actions'; text: string; owner?: string; due?: string }>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Transcription consentie :\n${transcript.slice(-60).map(l => `${l.speaker}: ${l.text}`).join('\n')}`,
    config: {
      systemInstruction: buildMeetingExpertInstruction(expert, 'NOTE_TAKER', outputLanguage),
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            section: { type: Type.STRING, enum: ['decisions', 'actions'] },
            text: { type: Type.STRING },
            owner: { type: Type.STRING },
            due: { type: Type.STRING },
          },
          required: ['section', 'text'],
        },
      },
    },
  });
  const parsed = JSON.parse(response.text || '[]');
  if (!Array.isArray(parsed)) throw new Error('Réponse de notes invalide');
  return parsed.filter((n: any) => (n.section === 'decisions' || n.section === 'actions') && typeof n.text === 'string');
};

/** Récapitulatif en direct (rôle LIVE_RECAP). */
export const meetingExpertRecap = async (
  expert: ExpertType, outputLanguage: string, transcript: Array<{ speaker: string; text: string }>,
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Transcription consentie :\n${transcript.slice(-60).map(l => `${l.speaker}: ${l.text}`).join('\n')}`,
    config: { systemInstruction: buildMeetingExpertInstruction(expert, 'LIVE_RECAP', outputLanguage) },
  });
  return (response.text || '').trim();
};
