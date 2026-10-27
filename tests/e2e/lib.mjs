// What the browser checks run on: the app served by Vite, driven in the Chrome installed on the
// machine through its debugging protocol (no test libraries). Each check gets a fresh page with
// nothing kept from the last one.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_PORT = 5199, DEBUG_PORT = 9339;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, what, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await fn()) return; } catch { /* not yet */ }
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Serves the app and starts Chrome; gives back a way to open pages and to stop both. */
export async function start() {
  const vite = spawn('npx', ['vite', '--port', String(APP_PORT), '--strictPort'], { stdio: 'ignore' });
  const profile = mkdtempSync(join(tmpdir(), 'planx-e2e-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--window-size=1200,800', 'about:blank'], { stdio: 'ignore' });
  await until(async () => (await fetch(`http://localhost:${APP_PORT}`)).ok, 'the app');
  await until(async () => (await fetch(`http://localhost:${DEBUG_PORT}/json/version`)).ok, 'Chrome');
  return {
    page: () => openPage(),
    stop: () => {
      chrome.kill();
      vite.kill();
      // Chrome may still be writing its profile as it goes; what's left is in the temp folder anyway.
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* left behind */ }
    },
  };
}

async function openPage() {
  const tabs = await (await fetch(`http://localhost:${DEBUG_PORT}/json`)).json();
  const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const wait = new Map(), errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description?.split('\n')[0]);
    if (wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); }
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    wait.set(++id, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  await cdp('Runtime.enable');
  let down = false;
  const p = {
    errors,
    cdp,
    /** The value of an expression in the page. */
    async ev(expr) {
      const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`in page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    },
    /** A fresh board at this size, with nothing kept from before (panels as by default). */
    async open(width = 1200, height = 800, scale = 1) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
      await cdp('Page.navigate', { url: `http://localhost:${APP_PORT}/?board=e2e${Date.now()}` });
      await until(() => p.ev(`!!document.querySelector('.topbar')`), 'the board');
      await p.ev('localStorage.clear()');
      await cdp('Page.reload');
      await until(() => p.ev(`!!document.querySelector('.topbar')`), 'the board again');
      await sleep(300);
    },
    async reload() {
      await cdp('Page.reload');
      await until(() => p.ev(`!!document.querySelector('.topbar')`), 'the board after reload');
      await sleep(300);
    },
    /** The mouse: moves without a button, presses and lets go of the left one; `modifiers` as in CDP
     *  (1 Alt, 2 Ctrl, 4 Meta, 8 Shift). */
    mouse(type, x, y, modifiers = 0) {
      if (type === 'mousePressed') down = true;
      if (type === 'mouseReleased') down = false;
      return cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !down ? 'none' : 'left', buttons: down ? 1 : 0, clickCount: 1, modifiers });
    },
    async click([x, y]) {
      await p.mouse('mouseMoved', x, y);
      await p.mouse('mousePressed', x, y);
      await p.mouse('mouseReleased', x, y);
      await sleep(250);
    },
    /** Presses at `a`, after resting there `rest` ms, drags to `b` in steps and lets go. */
    async drag(a, b, { rest = 0, hold = 0, steps = 12, modifiers = 0 } = {}) {
      await p.mouse('mouseMoved', a[0], a[1], modifiers);
      if (rest) await sleep(rest);
      await p.mouse('mousePressed', a[0], a[1], modifiers);
      if (hold) await sleep(hold);
      for (let i = 1; i <= steps; i++) {
        await p.mouse('mouseMoved', a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps, modifiers);
        await sleep(25);
      }
      await p.mouse('mouseReleased', b[0], b[1], modifiers);
      await sleep(300);
    },
    async key(key, code, vk, modifiers = 0) {
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
      await sleep(150);
    },
    escape: () => p.key('Escape', 'Escape', 27),
    /** An element's box on screen (rounded), or null. */
    rect: (q) => p.ev(`(() => { const e = document.querySelector(${JSON.stringify(q)}); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; })()`),
    /** An element's middle on screen. */
    async at(q) {
      const r = await p.rect(q);
      if (!r) throw new Error(`no ${q} on screen`);
      return [r.l + r.w / 2, r.t + r.h / 2];
    },
    /** A point just inside a panel's edge (3px in), halfway along it. */
    async edge(q, side) {
      const r = await p.rect(q);
      if (!r) throw new Error(`no ${q} on screen`);
      return { top: [r.l + r.w / 2, r.t + 3], bottom: [r.l + r.w / 2, r.b - 3], left: [r.l + 3, r.t + r.h / 2], right: [r.r - 3, r.t + r.h / 2] }[side];
    },
    /** Drags a panel's edge by (dx, dy), after resting on it till it can be taken hold of. */
    async dragEdge(q, side, dx, dy) {
      const a = await p.edge(q, side);
      await p.mouse('mouseMoved', a[0] + (side === 'left' ? 30 : side === 'right' ? -30 : 0), a[1] + (side === 'top' ? 30 : side === 'bottom' ? -30 : 0));
      await p.drag(a, [a[0] + dx, a[1] + dy], { rest: 650 });
    },
    /** How many buttons the rail shows, and whether it has its "more" button. */
    rail: () => p.ev(`({ n: document.querySelectorAll('.tools:not(.labs-rail) > [data-key]').length, more: !!document.querySelector('.tools:not(.labs-rail) > button[aria-label="Ещё"]') })`),
    /** Picks a tool on the rail (or in its "more" column) and clicks the board with it. */
    async make(tool, where) {
      if (!(await p.rect(`.tools [data-key="${tool}"]`))) await p.click(await p.at('.tools > button[aria-label="Ещё"]'));
      await p.click(await p.at(`[data-key="${tool}"], [data-more-key="${tool}"]`));
      await p.click(where);
      await p.escape();
    },
    /** Opens the board menu and clicks the row with this text. */
    async menu(label) {
      if (!(await p.rect('.board-menu'))) await p.click(await p.at('.topbar button[aria-label="Меню"]'));
      await p.click(await p.ev(`(() => { const e = [...document.querySelectorAll('.board-menu .menu-row')].find((r) => r.textContent.includes(${JSON.stringify(label)})); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    },
    close: () => ws.close(),
  };
  return p;
}

/** A failed check, with what was expected and what came. */
export function expect(actual, label) {
  const fail = (what) => { throw new Error(`${label}: expected ${what}, got ${JSON.stringify(actual)}`); };
  return {
    toBe: (v) => { if (actual !== v) fail(JSON.stringify(v)); },
    toBeNear: (v, tol = 1) => { if (typeof actual !== 'number' || Math.abs(actual - v) > tol) fail(`${v} ±${tol}`); },
    toBeTruthy: () => { if (!actual) fail('something truthy'); },
    toBeFalsy: () => { if (actual) fail('something falsy'); },
    toBeAtLeast: (v) => { if (!(actual >= v)) fail(`at least ${v}`); },
    toBeAtMost: (v) => { if (!(actual <= v)) fail(`at most ${v}`); },
  };
}
