// "Wishlist" (src/labs/WishlistPage.tsx): by "Мои доски", a wish written in, liked once from a browser.
import { expect, sleep } from '../lib.mjs';

const at = (p, sel) => p.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);

export const checks = {
  async 'wishes are written in, liked once each, sorted by likes or date, and "Мои доски" leads back'(p) {
    // Kept to this browser: the sync server (the dev one, if it's running) never sees the test's wishes.
    // (No WebSocket at all: blocking its address isn't enough for Chrome.)
    await p.cdp('Page.enable');
    const { identifier } = await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.WebSocket = class { constructor() { this.readyState = 0; } send() {} close() {} };` });
    await p.cdp('Page.navigate', { url: 'http://localhost:5199/' });
    await sleep(1200);
    await p.click(await at(p, '.shelf-tab'));
    expect(await p.ev('location.search'), 'its own address').toBe('?wishlist');
    expect(await p.ev(`!!document.querySelector('.wish-form textarea')`), 'the form').toBe(true);
    const say = async (text) => {
      await p.click(await at(p, '.wish-form textarea'));
      await p.cdp('Input.insertText', { text });
      await p.click(await at(p, '.wish-form button'));
      await sleep(150);
    };
    await say('Тёмная тема для меню');
    await sleep(20);
    await say('Экспорт в Figma');
    const texts = () => p.ev(`[...document.querySelectorAll('.wish p')].map((e) => e.textContent)`);
    expect((await texts()).join(' | '), 'the newer first while none is liked').toBe('Экспорт в Figma | Тёмная тема для меню');
    // Liking the older one twice leaves one like; once more, and it's on top by likes.
    const like = (i) => p.ev(`document.querySelectorAll('.wish-like')[${i}].click()`);
    await like(1); await sleep(100);
    expect((await texts())[0], 'liked goes on top').toBe('Тёмная тема для меню');
    expect(await p.ev(`document.querySelector('.wish-like').textContent`), 'one like').toBe('1');
    await like(0); await sleep(100);
    expect(await p.ev(`document.querySelectorAll('.wish-like')[0].textContent + document.querySelectorAll('.wish-like')[1].textContent`), 'a second press takes it back').toBe('00');
    await like(1); await sleep(100);
    await p.ev(`(() => { const s = document.querySelector('.wish-head select'); s.value = 'new'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(100);
    expect((await texts())[0], 'by date, the newest first').toBe('Экспорт в Figma');
    await p.click(await at(p, '.shelf-brand h1 a'));
    expect(await p.ev(`!!document.querySelector('.wishlist')`), 'back on the shelf').toBe(false);
    expect(await p.ev('location.search'), 'its address').toBe('');
    // More than 25: in pages.
    await p.click(await at(p, '.shelf-tab'));
    for (let i = 0; i < 25; i++) {
      await p.ev(`(() => { const t = document.querySelector('.wish-form textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'Пожелание ${'${i}'}'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await sleep(10);
      await p.ev(`document.querySelector('.wish-form button').click()`);
      await sleep(5);
    }
    await sleep(200);
    expect(await p.ev(`document.querySelectorAll('.wish').length`), '25 on a page').toBe(25);
    expect(await p.ev(`document.querySelectorAll('.wish-pages button').length`), 'two pages, back and on').toBe(4);
    await p.ev(`document.querySelector('.wish-pages [aria-label="Дальше"]').click()`);
    await sleep(100);
    expect(await p.ev(`document.querySelectorAll('.wish').length`), 'the rest on the second').toBe(2);
    await p.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  },
};
