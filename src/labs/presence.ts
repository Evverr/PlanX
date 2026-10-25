import { useSyncExternalStore } from 'react';
import type { Editor } from '../editor/editor';
import type { Connection } from '../collab/connection';
import type { Rect } from '../canvas/geometry';
import { labOn } from './labs';
import { cameraFor, flyTo } from './camera';
import { laser, LASER_FADE } from './overlays';

/**
 * What the features on trial share with the others on the board through the connection's presence
 * (not saved with the board): where each person is looking (to be followed, "Следовать за"), a call
 * for everyone to come over ("Все ко мне"), and the laser pointer's trail.
 */
interface Shared {
  user?: { name: string; color: string };
  view?: Rect | null;
  summon?: { t: number; view: Rect } | null;
  /** The trail's points with how long ago each was drawn, in ms, as of when it was sent. */
  laser?: { pts: Array<[number, number, number]> } | null;
}

/** Who you're following, for the avatars to show it. */
let following: { id: number; name: string; color: string } | null = null;
const followListeners = new Set<() => void>();
const setFollowingState = (f: typeof following) => { following = f; followListeners.forEach((fn) => fn()); };
const subscribeFollowing = (fn: () => void) => { followListeners.add(fn); return () => followListeners.delete(fn); };
export const useFollowing = () => useSyncExternalStore(subscribeFollowing, () => following);

export class LabsPresence {
  private seenSummons = new Map<number, number>();
  private viewTimer = 0;
  private laserSent = 0;
  private laserTimer = 0;
  private offs: Array<() => void> = [];

  constructor(private ed: Editor, private conn: Connection, private say: (text: string) => void) {
    const aw = conn.provider.awareness;
    const onChange = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      for (const id of [...added, ...updated]) if (id !== aw.clientID) this.heard(id, aw.getStates().get(id) as Shared | undefined);
      for (const id of removed) {
        laser.theirs.delete(id);
        if (following?.id === id) { this.say(`${following.name} ушёл с доски`); setFollowingState(null); }
      }
    };
    aw.on('change', onChange);
    this.offs.push(() => aw.off('change', onChange));
    // Summons already there when you come aren't for you.
    aw.getStates().forEach((st, id) => { const s = (st as Shared).summon; if (s) this.seenSummons.set(id, s.t); });
    this.offs.push(ed.subscribeUI(() => this.shareView()));
    this.shareView();
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    clearTimeout(this.viewTimer);
    clearTimeout(this.laserTimer);
    if (following) setFollowingState(null);
  }

  private set(field: keyof Shared, value: unknown): void {
    this.conn.provider.awareness.setLocalStateField(field, value);
  }

  /** What another person shares changed. */
  private heard(id: number, st: Shared | undefined): void {
    if (!st) return;
    if (following?.id === id) {
      if (!labOn('follow')) setFollowingState(null);
      else if (st.view) this.lookAt(st.view);
    }
    const s = st.summon;
    if (s && this.seenSummons.get(id) !== s.t) {
      this.seenSummons.set(id, s.t);
      if (labOn('follow')) {
        flyTo(this.ed, cameraFor(this.ed, s.view, 1), 600);
        this.say(`${st.user?.name ?? 'Участник'} позвал всех к себе`);
      }
    }
    if (st.laser?.pts.length) {
      const now = performance.now();
      laser.theirs.set(id, { color: st.user?.color ?? '#FF3B30', pts: st.laser.pts.map(([x, y, age]) => ({ x, y, t: now - age })) });
      this.ed.requestRender();
    }
  }

  /** Shows what the followed person sees, all of it. */
  private lookAt(view: Rect): void {
    const cam = cameraFor(this.ed, view, 1);
    const c = this.ed.cam;
    if (Math.abs(cam.x - c.x) < 0.5 && Math.abs(cam.y - c.y) < 0.5 && Math.abs(cam.z - c.z) < 1e-4) return;
    this.ed.cam = cam;
    this.ed.camChanged();
  }

  /** Tells the others where you're looking (a few times a second at most), while following is on. */
  private shareView(): void {
    if (this.viewTimer) return;
    this.viewTimer = window.setTimeout(() => {
      this.viewTimer = 0;
      const v = this.ed.viewRect(), r = (n: number) => Math.round(n);
      this.set('view', labOn('follow') ? { x: r(v.x), y: r(v.y), w: r(v.w), h: r(v.h) } : null);
    }, 80);
  }

  follow(id: number): void {
    const p = this.conn.peers().find((q) => q.id === id);
    if (!p) return;
    if (following?.id === id) { this.stopFollowing(); return; }
    setFollowingState({ id, name: p.name, color: p.color });
    const st = this.conn.provider.awareness.getStates().get(id) as Shared | undefined;
    if (st?.view) flyTo(this.ed, cameraFor(this.ed, st.view, 1), 400);
    else this.say(`${p.name} пока не делится тем, куда смотрит`);
  }

  stopFollowing(): void {
    if (following) setFollowingState(null);
  }

  get followingId(): number | null { return following?.id ?? null; }

  /** Calls everyone on the board over to what you see now. */
  summon(): boolean {
    if (!this.conn.peers().length) return false;
    const v = this.ed.viewRect();
    this.set('summon', { t: Date.now(), view: { x: Math.round(v.x), y: Math.round(v.y), w: Math.round(v.w), h: Math.round(v.h) } });
    return true;
  }

  /** Sends your laser trail (at most every 50 ms, and once more after the last change). */
  shareLaser(): void {
    const send = () => {
      this.laserSent = performance.now();
      const now = this.laserSent, r = (n: number) => Math.round(n * 10) / 10;
      const pts = laser.mine.filter((p) => now - p.t < LASER_FADE).map((p): [number, number, number] => [r(p.x), r(p.y), Math.round(now - p.t)]);
      this.set('laser', pts.length ? { pts } : null);
    };
    clearTimeout(this.laserTimer);
    if (performance.now() - this.laserSent >= 50) send();
    else this.laserTimer = window.setTimeout(send, 50);
  }
}
