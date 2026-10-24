// Runs the browser checks: `npm run e2e`, or `npm run e2e -- panels` for those whose name has
// "panels" in it. Each check starts on a fresh board; the run fails if any check does, or if the
// page threw an error meanwhile.
import { readdirSync } from 'node:fs';
import { start } from './lib.mjs';

const filter = process.argv[2] ?? '';
const dir = new URL('./checks/', import.meta.url);
const all = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()) {
  const { checks } = await import(new URL(f, dir));
  for (const [name, fn] of Object.entries(checks)) all.push([`${f.replace('.mjs', '')}: ${name}`, fn]);
}
const chosen = all.filter(([name]) => name.includes(filter));

const env = await start();
let failed = 0;
for (const [name, fn] of chosen) {
  const page = await env.page();
  const t0 = Date.now();
  try {
    await page.open();
    await fn(page);
    if (page.errors.length) throw new Error(`the page threw: ${page.errors.join('; ')}`);
    console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
  page.close();
}
env.stop();
console.log(`\n${chosen.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
