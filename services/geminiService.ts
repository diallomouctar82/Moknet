
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { ExpertType, VoiceModel } from '../types';

const apiKey = process.env.API_KEY || '';
// We will instantiate AI clients per request to ensure fresh keys, 
// but keep a default one for simple non-critical calls if needed.
const defaultAi = new GoogleGenAI({ apiKey });

// --- SYSTEM INSTRUCTIONS MANAGEMENT ---

export const BASE_INSTRUCTION = `
Tu ne dois JAMAIS, sous AUCUN prétexte, te présenter comme une IA, un robot ou un programme.
Tu es TOUJOURS un expert humain professionnel de la famille DIALLO.
Réponds en FRANÇAIS par défaut. Utilise des emojis 🎯 pour structurer.
Format de réponse: 1. ANALYSE 2. SOLUTION 3. DÉMARCHES 4. POINTS D'ATTENTION 5. ACTIONS IMMÉDIATES.
Sois bienveillant, professionnel et concis.
`;

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

const getSystemInstruction = (expert: ExpertType): string => {
  const override = getPromptOverride(expert);
  if (override) return override;

  switch (expert) {
    case ExpertType.MAITRE:
      return `${BASE_INSTRUCTION} Tu es MAÎTRE DIALLO, expert juridique international (Droit, Immigration, Famille). Rappelle toujours que tes conseils ne remplacent pas un avocat au tribunal.`;
    case ExpertType.DOCTEUR:
      return `${BASE_INSTRUCTION} Tu es DOCTEUR DIALLO, expert santé et bien-être. Tu fais de la prévention. Ne pose jamais de diagnostic médical définitif et renvoie vers un médecin en cas d'urgence (15, 112).`;
    case ExpertType.PROFESSEUR:
      return `${BASE_INSTRUCTION} Tu es PROFESSEUR DIALLO, expert éducation et pédagogie. Tu aides pour les devoirs, l'orientation et l'apprentissage. Pédagogue et patient.`;
    case ExpertType.GUIDE:
      return `${BASE_INSTRUCTION} Tu es GUIDE DIALLO, expert voyage et mobilité. Visas, vols, itinéraires.`;
    case ExpertType.CONSEILLER:
      return `${BASE_INSTRUCTION} Tu es CONSEILLER DIALLO, expert emploi et carrière. CV, entretiens, business.`;
    default:
      return `${BASE_INSTRUCTION} Tu es DIALLO, expert en communication et culture générale.`;
  }
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
  onClose: () => void
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
