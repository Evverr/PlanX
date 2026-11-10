import type { Connection } from '../collab/connection';

/**
 * «Аудиозвонок» (src/labs): one call per board, all in it hearing all. Each one's browser sends its voice
 * straight to each of the others' (WebRTC), what they need to find each other going round with who's on
 * the board (the sync server's awareness: no server of its own). Three at most at first; a fourth asks,
 * and anyone in it lets them in (the call one bigger from then on), or not.
 */

/** What each one on the board says of the call: in it or not, its microphone off, how many it may hold
 *  (as far as they know), asking to come in (since when), whom they've let in or not, and what's
 *  for each of the others in it to connect (by their awareness id). */
export interface CallState {
  on?: boolean;
  muted?: boolean;
  limit?: number;
  ask?: number;
  let?: number[];
  no?: number[];
  sig?: Record<string, Sig>;
}
/** An offer to connect (from the one of two with the lower id) or the answer to it, `n` naming the try. */
interface Sig { n: string; offer?: string; answer?: string }

export interface Member { id: number; name: string; color: string; muted: boolean; state: CallState }

/** How many a call holds before the next has to ask, and how long they wait for an answer, in ms. */
export const LIMIT = 3;
const ASK_MS = 30000;
const ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

interface Line { pc: RTCPeerConnection; n: string; audio: HTMLAudioElement; level?: AnalyserNode; answered?: boolean }

export class Call {
  /** In it: my microphone, and the line to each of the others. */
  private stream: MediaStream | null = null;
  private lines = new Map<number, Line>();
  private ctx: AudioContext | null = null;
  private mine: AnalyserNode | null = null;
  private listeners = new Set<() => void>();
  private asking: number | null = null;
  state: CallState = {};
  /** A word for me (no answer, not let in, no microphone), till it's read. */
  notice: string | null = null;
  /** Something changed: a number to compare. */
  version = 0;

  constructor(private conn: Connection) {
    this.aw.on('change', this.sync);
  }

  private get aw() { return this.conn.provider.awareness; }
  get me(): number { return this.aw.clientID; }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private notify(): void { this.version++; this.listeners.forEach((fn) => fn()); }
  private publish(): void { this.aw.setLocalStateField('call', { ...this.state }); this.notify(); }

  /** The others on the board, and what they say of the call. */
  private others(): Member[] {
    const out: Member[] = [];
    this.aw.getStates().forEach((st, id) => {
      if (id === this.me || !st.user) return;
      const c = (st.call ?? {}) as CallState;
      out.push({ id, name: st.user.name, color: st.user.color, muted: !!c.muted, state: c });
    });
    return out;
  }
  /** Those in the call, but me. */
  members(): Member[] { return this.others().filter((m) => m.state.on); }
  /** How many it may hold now: three, or as many as it was let grow to. */
  limit(): number { return Math.max(LIMIT, this.state.limit ?? 0, ...this.members().map((m) => m.state.limit ?? 0)); }
  /** Whether someone in it has let me in. */
  private admitted(): boolean { return this.members().some((m) => m.state.let?.includes(this.me)); }
  /** Whether there's no room for me (and no one has let me in). */
  full(): boolean { return !this.state.on && this.members().length >= this.limit() && !this.admitted(); }
  /** Those asking to come in, but whom I've answered. */
  askers(): Member[] {
    if (!this.state.on) return [];
    return this.others().filter((m) => !m.state.on && m.state.ask && !this.state.let?.includes(m.id) && !this.state.no?.includes(m.id));
  }
  isAsking(): boolean { return !!this.state.ask; }

  async join(): Promise<void> {
    if (this.state.on) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      this.notice = 'Нет доступа к микрофону: разрешите его браузеру';
      this.notify();
      return;
    }
    this.ctx = new AudioContext();
    this.mine = this.analyse(this.stream);
    // (Let in past the limit: it's one bigger from now on.)
    const count = this.members().length + 1;
    this.state = { on: true, limit: count > LIMIT ? count : undefined, sig: {} };
    this.stopAsking();
    this.publish();
    this.sync();
  }

  leave(): void {
    this.lines.forEach((l) => this.hangUp(l));
    this.lines.clear();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close();
    this.ctx = null;
    this.mine = null;
    this.state = {};
    this.publish();
  }

  toggleMute(): void {
    if (!this.state.on) return;
    const muted = !this.state.muted;
    this.stream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    this.state = { ...this.state, muted };
    this.publish();
  }

  /** Asks those in it to let me in; no answer in ASK_MS, it's given up. */
  ask(): void {
    this.state = { ...this.state, ask: Date.now() };
    this.notice = null;
    this.publish();
    if (this.asking) clearTimeout(this.asking);
    this.asking = window.setTimeout(() => {
      if (!this.state.ask) return;
      this.stopAsking();
      this.notice = 'Не ответили';
      this.publish();
    }, ASK_MS);
  }
  stopAsking(): void {
    if (this.asking) clearTimeout(this.asking);
    this.asking = null;
    if (this.state.ask) { this.state = { ...this.state, ask: undefined }; this.publish(); }
  }

  /** Lets someone asking in: the call one bigger. */
  admit(id: number): void {
    this.state = { ...this.state, let: [...(this.state.let ?? []), id], limit: Math.max(this.limit(), this.members().length + 2) };
    this.publish();
  }
  refuse(id: number): void {
    this.state = { ...this.state, no: [...(this.state.no ?? []), id] };
    this.publish();
  }

  readNotice(): void { if (this.notice) { this.notice = null; this.notify(); } }

  /** How loud each one is now (0…1): me (as 'me') and the others in it by id. */
  levels(): Map<number | 'me', number> {
    const out = new Map<number | 'me', number>();
    const of = (a: AnalyserNode) => {
      const buf = new Uint8Array(a.fftSize);
      a.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(sum / buf.length) * 4);
    };
    if (this.mine && !this.state.muted) out.set('me', of(this.mine));
    this.lines.forEach((l, id) => { if (l.level) out.set(id, of(l.level)); });
    return out;
  }

  /** Whether the line to someone is up. */
  connected(id: number): boolean {
    const s = this.lines.get(id)?.pc.connectionState;
    return s === 'connected';
  }

  private analyse(stream: MediaStream): AnalyserNode | null {
    if (!this.ctx) return null;
    const a = this.ctx.createAnalyser();
    a.fftSize = 512;
    this.ctx.createMediaStreamSource(stream).connect(a);
    return a;
  }

  private hangUp(l: Line): void {
    l.pc.close();
    l.audio.pause();
    l.audio.srcObject = null;
  }

  /** A new line to someone, my microphone on it, what comes back played. */
  private line(id: number, n: string): Line {
    const pc = new RTCPeerConnection({ iceServers: ICE }), audio = new Audio();
    audio.autoplay = true;
    const l: Line = { pc, n, audio };
    this.stream?.getTracks().forEach((t) => pc.addTrack(t, this.stream!));
    pc.ontrack = (e) => {
      const s = e.streams[0] ?? new MediaStream([e.track]);
      audio.srcObject = s;
      void audio.play().catch(() => {});
      l.level = this.analyse(s) ?? undefined;
      this.notify();
    };
    pc.onconnectionstatechange = () => this.notify();
    this.lines.set(id, l);
    return l;
  }

  /** Its description once it has found all the ways to it it will (or in a while, whatever it has). */
  private static async gathered(pc: RTCPeerConnection): Promise<string> {
    await new Promise<void>((done) => {
      if (pc.iceGatheringState === 'complete') return done();
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') done(); });
      setTimeout(done, 2500);
    });
    return JSON.stringify(pc.localDescription);
  }

  private setSig(id: number, sig: Sig | undefined): void {
    const all = { ...(this.state.sig ?? {}) };
    if (sig) all[id] = sig; else delete all[id];
    this.state = { ...this.state, sig: all };
    this.publish();
  }

  /** On every change of who's on the board and what they say: let in, given up on, lines made to those
   *  in it and dropped to those gone. */
  private sync = (): void => {
    if (this.state.ask && this.admitted()) { void this.join(); return; }
    if (this.state.ask) {
      const members = this.members();
      if (members.length && members.every((m) => m.state.no?.includes(this.me))) {
        this.stopAsking();
        this.notice = 'Не пустили';
        this.publish();
        return;
      }
    }
    if (!this.state.on) { this.notify(); return; }
    const members = this.members(), here = new Set(members.map((m) => m.id));
    // Gone from it: their line closed, what was for them dropped.
    for (const [id, l] of this.lines) if (!here.has(id)) { this.hangUp(l); this.lines.delete(id); }
    for (const id of Object.keys(this.state.sig ?? {})) if (!here.has(Number(id))) this.setSig(Number(id), undefined);
    for (const m of members) {
      const theirs = m.state.sig?.[this.me], l = this.lines.get(m.id);
      if (this.me < m.id) {
        // Mine to offer: once, then their answer taken.
        if (!l) void this.offer(m.id);
        else if (theirs?.answer && theirs.n === l.n && !l.answered && l.pc.signalingState === 'have-local-offer') {
          l.answered = true;
          void l.pc.setRemoteDescription(JSON.parse(theirs.answer));
        }
      } else if (theirs?.offer && (!l || l.n !== theirs.n)) void this.answer(m.id, theirs);
    }
    this.notify();
  };

  private async offer(id: number): Promise<void> {
    const l = this.line(id, Math.random().toString(36).slice(2, 10));
    await l.pc.setLocalDescription(await l.pc.createOffer());
    const offer = await Call.gathered(l.pc);
    if (this.lines.get(id) === l) this.setSig(id, { n: l.n, offer });
  }

  private async answer(id: number, sig: Sig): Promise<void> {
    const old = this.lines.get(id);
    if (old) this.hangUp(old);
    const l = this.line(id, sig.n);
    await l.pc.setRemoteDescription(JSON.parse(sig.offer!));
    await l.pc.setLocalDescription(await l.pc.createAnswer());
    const answer = await Call.gathered(l.pc);
    if (this.lines.get(id) === l) this.setSig(id, { n: l.n, answer });
  }

  destroy(): void {
    this.aw.off('change', this.sync);
    if (this.state.on) this.leave();
    if (this.asking) clearTimeout(this.asking);
  }
}
