// Audio et vidéo de l'appel : une connexion WebRTC par paire de participants
// humains (maillage), signalisation via le bus de l'appel.
//
// Limites connues (voir docs) : au-delà d'environ 6 personnes il faut un
// serveur média (SFU) ; entre réseaux différents il faut un serveur TURN.

import { MeetingClient } from './meetingClient';
import { CallMode, MeetingState } from './types';
import { joinedHumans } from './meetingCore';

interface Peer {
  id: string;
  createdAt: number;
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  remote: MediaStream;
}

export interface PeerDiagnostics {
  peerId: string;
  connectionState: RTCPeerConnectionState;
  remoteAudioTracks: number;
  remoteVideoTracks: number;
}

const readIceServers = (): RTCIceServer[] => {
  try {
    const raw = (import.meta as any).env?.VITE_ICE_SERVERS;
    if (raw) return JSON.parse(raw);
  } catch { /* configuration invalide : valeur par défaut */ }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
};

export class MediaMesh {
  localStream: MediaStream | null = null;
  mediaError: string | null = null;
  private peers = new Map<string, Peer>();
  private unsubscribeSignal: () => void;
  private mode: CallMode = 'audio';
  private stopped = false;
  private iceServers = readIceServers();
  private watchdog: ReturnType<typeof setInterval>;
  private joined = new Set<string>();
  // Signaux de personnes pas (encore) vues dans l'appel : jamais de flux envoyé à un inconnu.
  private pendingFromUnknown = new Map<string, Array<{ at: number; data: any }>>();
  static STUCK_AFTER_MS = 8000;

  constructor(private client: MeetingClient, private meetingId: string, private onChange: () => void) {
    this.unsubscribeSignal = client.onSignal(m => {
      if (m.meetingId !== this.meetingId) return;
      void this.handleSignal(m.from, m.data);
    });
    // Chien de garde : une connexion jamais établie (message perdu) ou en échec est
    // recréée des deux côtés, à l'initiative du participant « impoli » uniquement.
    this.watchdog = setInterval(() => this.recoverStuckPeers(), 3000);
  }

  private recoverStuckPeers() {
    const now = Date.now();
    for (const p of Array.from(this.peers.values())) {
      if (p.polite) continue;
      if (!p.pc.getTransceivers().length) continue; // aucun flux à négocier : rien à relancer
      const st = p.pc.connectionState;
      const stuck = (st === 'new' || st === 'connecting') && now - p.createdAt > MediaMesh.STUCK_AFTER_MS;
      if (stuck || st === 'failed') {
        console.warn('[appel] connexion bloquée, renégociation', p.id, st);
        this.closePeer(p.id);
        this.client.sendSignal(this.meetingId, p.id, { reset: true });
        this.createPeer(p.id);
      }
    }
  }

  /** Ouvre le micro (et la caméra en vidéo). En cas de refus, l'appel continue en écoute seule. */
  async start(mode: CallMode) {
    this.mode = mode;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === 'video' });
      this.mediaError = null;
    } catch (e) {
      try {
        // Sans caméra (ou caméra refusée), on garde au moins le micro.
        if (mode !== 'video') throw e;
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaError = `Caméra indisponible (${(e as Error).name || 'erreur'}) : vous participez en audio.`;
      } catch (e2) {
        stream = new MediaStream();
        this.mediaError = `Micro/caméra indisponible (${(e2 as Error).name || 'erreur'}) : vous pouvez écouter et écrire.`;
      }
    }
    // L'appel a pu être quitté pendant la demande d'autorisation : ne rien laisser allumé.
    if (this.stopped) { stream.getTracks().forEach(t => t.stop()); return; }
    this.localStream = stream;
    for (const p of this.peers.values()) this.attachLocalTracks(p);
    this.onChange();
  }

  /** Aligne les connexions sur l'état de l'appel : arrivées, départs, passage en vidéo. */
  async sync(state: MeetingState) {
    if (this.stopped) return;
    const me = this.client.me.id;
    const others = joinedHumans(state).filter(p => p.id !== me).map(p => p.id);
    this.joined = new Set(others);
    for (const id of others) if (!this.peers.has(id)) this.createPeer(id);
    for (const [id, queued] of Array.from(this.pendingFromUnknown.entries())) {
      if (!this.joined.has(id)) continue;
      this.pendingFromUnknown.delete(id);
      for (const q of queued) await this.handleSignal(id, q.data);
    }
    // On ne ferme que les connexions des personnes explicitement parties : un signal
    // peut précéder de quelques millisecondes l'état qui annonce l'arrivée d'un participant.
    const gone = state.participants.filter(p => p.status === 'left' || p.status === 'declined').map(p => p.id);
    for (const id of Array.from(this.peers.keys())) if (gone.includes(id)) this.closePeer(id);
    if (state.mode !== this.mode) await this.switchMode(state.mode);
  }

  setMuted(muted: boolean) {
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = !muted; });
  }

  setCamera(on: boolean) {
    this.localStream?.getVideoTracks().forEach(t => { t.enabled = on; });
  }

  remoteStream(peerId: string): MediaStream | undefined { return this.peers.get(peerId)?.remote; }

  diagnostics(): PeerDiagnostics[] {
    return Array.from(this.peers.values()).map(p => ({
      peerId: p.id,
      connectionState: p.pc.connectionState,
      remoteAudioTracks: p.remote.getAudioTracks().length,
      remoteVideoTracks: p.remote.getVideoTracks().length,
    }));
  }

  stop() {
    this.stopped = true;
    clearInterval(this.watchdog);
    this.unsubscribeSignal();
    for (const id of Array.from(this.peers.keys())) this.closePeer(id);
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
  }

  // --- Interne -------------------------------------------------------------

  private async switchMode(mode: CallMode) {
    this.mode = mode;
    if (!this.localStream) return;
    if (mode === 'video' && !this.localStream.getVideoTracks().length) {
      try {
        const cam = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = cam.getVideoTracks()[0];
        if (this.stopped || !this.localStream) { track.stop(); return; }
        this.localStream.addTrack(track);
        for (const p of this.peers.values()) p.pc.addTrack(track, this.localStream); // déclenche la renégociation
      } catch (e) {
        this.mediaError = `Caméra indisponible (${(e as Error).name || 'erreur'}) : vous restez en audio.`;
      }
    } else if (mode === 'audio') {
      for (const t of this.localStream.getVideoTracks()) {
        for (const p of this.peers.values()) {
          const sender = p.pc.getSenders().find(s => s.track === t);
          if (sender) p.pc.removeTrack(sender);
        }
        t.stop();
        this.localStream.removeTrack(t);
      }
    }
    this.onChange();
  }

  private attachLocalTracks(p: Peer) {
    if (!this.localStream) return;
    const sent = new Set(p.pc.getSenders().map(s => s.track));
    for (const t of this.localStream.getTracks()) if (!sent.has(t)) p.pc.addTrack(t, this.localStream);
  }

  private createPeer(id: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer: Peer = { id, createdAt: Date.now(), pc, polite: this.client.me.id > id, makingOffer: false, ignoreOffer: false, remote: new MediaStream() };
    this.peers.set(id, peer);
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.client.sendSignal(this.meetingId, id, { description: pc.localDescription?.toJSON() });
      } catch (e) {
        console.warn('[appel] négociation échouée', id, e);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.client.sendSignal(this.meetingId, id, { candidate: candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (!peer.remote.getTracks().includes(e.track)) peer.remote.addTrack(e.track);
      e.track.onended = () => { peer.remote.removeTrack(e.track); this.onChange(); };
      this.onChange();
    };
    pc.onconnectionstatechange = () => this.onChange();
    this.attachLocalTracks(peer);
    return peer;
  }

  private closePeer(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    this.peers.delete(id);
    this.onChange();
  }

  /** Négociation « parfaite » (pattern W3C) : gère les offres croisées sans blocage. */
  private async handleSignal(from: string, data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; reset?: boolean }) {
    if (this.stopped) return;
    if (!this.joined.has(from)) {
      const now = Date.now();
      const q = (this.pendingFromUnknown.get(from) ?? []).filter(x => now - x.at < 15_000);
      if (q.length < 200) q.push({ at: now, data });
      this.pendingFromUnknown.set(from, q);
      return;
    }
    if (data.reset) { this.closePeer(from); this.createPeer(from); return; }
    const peer = this.peers.get(from) ?? this.createPeer(from);
    const pc = peer.pc;
    try {
      if (data.description) {
        const collision = data.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          this.client.sendSignal(this.meetingId, from, { description: pc.localDescription?.toJSON() });
        }
      } else if (data.candidate) {
        try { await pc.addIceCandidate(data.candidate); } catch (e) { if (!peer.ignoreOffer) throw e; }
      }
    } catch (e) {
      console.warn('[appel] signal non traité', from, e);
    }
  }
}
