import { useEffect, useReducer, useRef, useState } from 'react';
import { BroadcastBus } from '../../services/meeting/bus';
import { MeetingClient } from '../../services/meeting/meetingClient';
import { ConversationStore } from '../../services/meeting/conversationStore';
import { createAiServices, AiMode } from '../../services/meeting/runtime';
import { DEMO_PEOPLE, findDemoPerson } from '../../services/meeting/directory';
import { MediaMesh } from '../../services/meeting/mediaMesh';
import { MeetingState } from '../../services/meeting/types';

const IDENTITY_KEY = 'mok_call_identity';

/** Identité de démonstration de l'onglet : ?as=<id>, sinon mémorisée pour l'onglet. */
export const initialIdentity = (): string => {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('as');
    if (findDemoPerson(fromUrl)) { sessionStorage.setItem(IDENTITY_KEY, fromUrl!); return fromUrl!; }
    const saved = sessionStorage.getItem(IDENTITY_KEY);
    if (findDemoPerson(saved)) return saved!;
  } catch { /* stockage indisponible */ }
  return DEMO_PEOPLE[0].id;
};

export const rememberIdentity = (id: string) => {
  try { sessionStorage.setItem(IDENTITY_KEY, id); } catch { /* ignoré */ }
};

export const useCallClient = (identityId: string) => {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [state, setState] = useState<{ client: MeetingClient; store: ConversationStore; aiMode: AiMode } | null>(null);

  useEffect(() => {
    const person = findDemoPerson(identityId) ?? DEMO_PEOPLE[0];
    const bus = new BroadcastBus();
    const store = new ConversationStore(window.localStorage);
    const ai = createAiServices((event, data) => console.info('[appel]', event, data));
    const client = new MeetingClient({
      bus, me: { id: person.id, name: person.name, lang: person.lang }, store,
      translator: ai.translator, expertEngine: ai.expertEngine,
      onLog: (event, data) => console.info('[appel]', event, data),
    });
    const unsub = client.subscribe(rerender);
    const onStorage = (e: StorageEvent) => { if (e.key === 'mok_call_conversations_v1') rerender(); };
    window.addEventListener('storage', onStorage);
    // Quitter proprement si l'onglet se ferme : l'hôte suivant reprend l'appel.
    const onHide = () => {
      const m = client.currentMeeting();
      if (m) client.dispatch(m.id, { type: 'LEAVE', userId: person.id }).catch(() => undefined);
    };
    window.addEventListener('pagehide', onHide);
    setState({ client, store, aiMode: ai.mode });
    return () => {
      onHide();
      unsub();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', onHide);
      client.dispose();
      bus.close();
      setState(null);
    };
  }, [identityId]);

  return state;
};

/** Connexions audio/vidéo de l'appel en cours, synchronisées avec son état. */
export const useMediaMesh = (client: MeetingClient, meeting: MeetingState | undefined) => {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const meshRef = useRef<MediaMesh | null>(null);
  const meetingId = meeting?.id;

  useEffect(() => {
    if (!meetingId) return;
    const mesh = new MediaMesh(client, meetingId, rerender);
    meshRef.current = mesh;
    const initialMode = client.get(meetingId)?.mode ?? 'audio';
    void mesh.start(initialMode).then(() => {
      const st = client.get(meetingId);
      if (st) void mesh.sync(st);
    });
    (window as any).__moknetCallDiagnostics = () => ({
      me: client.me.id,
      meeting: client.get(meetingId),
      media: mesh.diagnostics(),
      localTracks: mesh.localStream?.getTracks().map(t => t.kind) ?? [],
      translation: client.translationStats(),
    });
    return () => { mesh.stop(); meshRef.current = null; };
  }, [client, meetingId]);

  useEffect(() => {
    if (meeting && meshRef.current) void meshRef.current.sync(meeting);
  }, [meeting]);

  return meshRef.current;
};
