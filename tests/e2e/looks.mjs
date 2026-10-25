// Pictures of the panels in every state that shows them, at every panel size, to compare a change to
// the styles pixel by pixel: `node tests/e2e/looks.mjs shoot <dir>` takes them, `node tests/e2e/looks.mjs
// compare <before> <after>` says which differ and by how many pixels.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sleep, start } from './lib.mjs';

/** Each state: how to bring it about on a fresh board (with a sticky on it, selected). */
const STATES = {
  selected: async () => {},
  menu: async (p) => { await p.click(await p.at('.topbar button[aria-label="Меню"]')); },
  palette: async (p) => { await p.click(await p.at('.bar.panel [data-key="colors"] button, .bar.panel [data-key="colors"]')); },
  shapes: async (p) => {
    const a = await p.at('.tools [data-key="oval"]');
    await p.mouse('mouseMoved', ...a); await p.mouse('mousePressed', ...a); await sleep(400); await p.mouse('mouseReleased', ...a);
  },
  draw: async (p) => {
    const a = await p.at('.tools [data-key="draw"]');
    await p.mouse('mouseMoved', ...a); await p.mouse('mousePressed', ...a); await sleep(400); await p.mouse('mouseReleased', ...a);
  },
  icons: async (p) => { await p.key('i', 'KeyI', 73); },
  recorder: async (p) => {
    if (!(await p.rect('.tools [data-key="audio"]'))) await p.click(await p.at('.tools > button[aria-label="Ещё"]'));
    await p.click(await p.at('[data-key="audio"], [data-more-key="audio"]'));
  },
  help: async (p) => { await p.click(await p.at('.bar.zoom [aria-label="Подсказки"]')); },
  map: async (p) => { await p.click(await p.at('.bar.zoom [aria-label="Карта доски"]')); },
  clear: async (p) => { await p.click(await p.at('.topbar button[aria-label="Очистить доску"]')); },
  'rail-more': async (p, size) => { await p.open(900, 520); await setUp(p, size); await p.click(await p.at('.tools > button[aria-label="Ещё"]')); },
  'bar-more': async (p, size) => { await p.open(400, 800); await setUp(p, size); await p.click(await p.at('.bar.zoom .more-wrap > button')); },
};
const SIZES = ['l', 'm', 's'];

/** The panels at this size, and the same "me" every time (or the cat in the zoom bar would differ). */
async function setUp(p, size) {
  await p.ev(`localStorage.setItem('planx-panel-size', '${size}'); localStorage.setItem('planx-me', JSON.stringify({ name: 'Ёж', color: '#E5484D' }))`);
  await p.reload();
  await p.make('sticky', [600, 380]);
  await p.click([600, 380]);
  await sleep(900);
}

async function shoot(dir) {
  mkdirSync(dir, { recursive: true });
  const env = await start();
  for (const size of SIZES) {
    for (const [name, bring] of Object.entries(STATES)) {
      const p = await env.page();
      await p.open();
      await setUp(p, size);
      await bring(p, size);
      await p.mouse('mouseMoved', 5, 795);
      await sleep(700);
      const shot = await p.cdp('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(dir, `${size}-${name}.png`), Buffer.from(shot.data, 'base64'));
      p.close();
    }
  }
  env.stop();
  console.log(`${SIZES.length * Object.keys(STATES).length} pictures in ${dir}`);
}

async function compare(a, b) {
  const env = await start();
  const p = await env.page();
  await p.open();
  let differ = 0;
  for (const f of readdirSync(a).filter((f) => f.endsWith('.png')).sort()) {
    const ua = `data:image/png;base64,${readFileSync(join(a, f)).toString('base64')}`, ub = `data:image/png;base64,${readFileSync(join(b, f)).toString('base64')}`;
    const n = await p.ev(`(async () => {
      const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
      const [x, y] = await Promise.all([load(${JSON.stringify(ua)}), load(${JSON.stringify(ub)})]);
      if (x.width !== y.width || x.height !== y.height) return -1;
      const c = document.createElement('canvas'); c.width = x.width; c.height = x.height;
      const g = c.getContext('2d'); g.drawImage(x, 0, 0); const dx = g.getImageData(0, 0, c.width, c.height).data;
      g.clearRect(0, 0, c.width, c.height); g.drawImage(y, 0, 0); const dy = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let i = 0; i < dx.length; i += 4) {
        if (dx[i] === dy[i] && dx[i + 1] === dy[i + 1] && dx[i + 2] === dy[i + 2]) continue;
        n++;
        const px = (i / 4) % c.width, py = Math.floor(i / 4 / c.width);
        x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
      }
      return n ? n + ' pixels differ, within ' + x0 + ',' + y0 + ' – ' + x1 + ',' + y1 : 0; })()`);
    if (n) { differ++; console.log(`  ${f}: ${n === -1 ? 'size differs' : n}`); }
  }
  p.close();
  env.stop();
  console.log(differ ? `${differ} pictures differ` : 'all the same');
}

/** The boxes of everything in the panels and popups, in every state at every size: where pictures
 *  differ only by how text is smoothed, these say whether anything has really moved. */
async function measure(file) {
  const env = await start(), out = {};
  for (const size of SIZES) {
    for (const [name, bring] of Object.entries(STATES)) {
      const p = await env.page();
      await p.open();
      await setUp(p, size);
      await bring(p, size);
      await p.mouse('mouseMoved', 5, 795);
      await sleep(700);
      out[`${size}-${name}`] = await p.ev(`[...document.querySelectorAll('.bar, .bar *, .tools, .tools *, .tools-more, .tools-more *, .tfmt, .tfmt *, .pop, .pop *, .board-menu, .board-menu *, .draw-panel, .draw-panel *, .op-pop, .op-pop *, .minimap, .more-pop, .more-pop *')]
        .map((e) => { const r = e.getBoundingClientRect(); return (e.className?.baseVal ?? e.className) + '|' + [r.x, r.y, r.width, r.height].map((v) => v.toFixed(2)).join(','); })`);
      p.close();
    }
  }
  env.stop();
  writeFileSync(file, JSON.stringify(out));
}

const [cmd, x, y] = process.argv.slice(2);
if (cmd === 'measure') await measure(x);
else if (cmd === 'shoot') await shoot(x);
else if (cmd === 'compare') await compare(x, y);
else console.log('usage: looks.mjs shoot <dir> | compare <before> <after>');
