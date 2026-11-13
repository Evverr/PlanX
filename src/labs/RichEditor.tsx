import { useLayoutEffect, useRef } from 'react';
import type { Editor } from '../editor/editor';
import { PAGE, type Item } from '../model/types';
import { fontOf, FONTS, LINE_HEIGHT } from '../canvas/text';
import { PAGE_TEXT } from './docPage';
import { cleanPaste, cssColor, fromDom, headingStyle, toHtml } from './richDoc';

/**
 * «Документ» typed in as it looks: a field the browser edits laid over the sheet's text (scaled with the
 * board), its words bold, italic… and its headings as the page draws them, all of it at once (no pages:
 * it scrolls). Kept as text and styles (richDoc.ts) once it's done with, as a sticker's text is. The text
 * panel's buttons work on what's picked in it (richStyle, richHeading), Cmd+B, Cmd+I, Cmd+U too.
 */

/** The field being typed in, and what was last picked in it (a press on the panel keeps it). */
let active: { el: HTMLDivElement; fs: number; range: Range | null } | null = null;
export const richActive = (): boolean => !!active;

/** What's picked in it, back as it was (the field focused again). */
function restore(): boolean {
  if (!active) return false;
  active.el.focus();
  const sel = getSelection();
  if (active.range && sel) { sel.removeAllRanges(); sel.addRange(active.range); }
  return true;
}

/** Bold, italic, underlined or struck through on what's picked (off again if it's so already), or its
 *  colour (none: the text's own). */
export function richStyle(key: 'b' | 'i' | 'u' | 'x' | 'c', value?: string): boolean {
  if (!restore()) return false;
  document.execCommand('styleWithCSS', false, 'true');
  if (key === 'c') document.execCommand('foreColor', false, value ? cssColor(value) : getComputedStyle(active!.el).color);
  else document.execCommand({ b: 'bold', i: 'italic', u: 'underline', x: 'strikeThrough' }[key]);
  return true;
}

/** The paragraph the caret's in (the field itself pointed at, its child there). */
function paragraphAt(root: HTMLElement): HTMLElement | null {
  const sel = getSelection();
  let n: Node | null = sel?.anchorNode ?? null;
  if (n === root) return (root.childNodes[Math.max(0, (sel?.anchorOffset ?? 1) - 1)] as HTMLElement) ?? null;
  while (n && n.parentNode !== root) n = n.parentNode;
  return n as HTMLElement | null;
}

/** The paragraphs what's picked is in (the caret's). */
function pickedParagraphs(): HTMLElement[] {
  const sel = getSelection(), root = active?.el;
  if (!root || !sel?.rangeCount) return [];
  const r = sel.getRangeAt(0), top = (n: Node | null) => { while (n && n.parentNode !== root) n = n.parentNode; return n as HTMLElement | null; };
  const a = top(r.startContainer), b = top(r.endContainer);
  if (!a) return root.firstElementChild ? [root.firstElementChild as HTMLElement] : [];
  const out: HTMLElement[] = [];
  for (let p: Element | null = a; p; p = p.nextElementSibling) { out.push(p as HTMLElement); if (p === b || !b) break; }
  return out;
}

/** The paragraphs what's picked is in made headings of `level` (0: plain text again). */
export function richHeading(level: number): boolean {
  if (!restore() || !active) return false;
  for (const p of pickedParagraphs()) {
    p.dataset.h = String(level);
    p.setAttribute('style', headingStyle(level, active.fs, p === active.el.firstElementChild));
  }
  return true;
}

/** The paragraphs what's picked is in made a list (`kind` 'bullet' or 'number'), or not one any more
 *  (all of them that list already). */
export function richList(kind: string): boolean {
  if (!restore() || !active) return false;
  const ps = pickedParagraphs(), off = ps.length > 0 && ps.every((p) => p.dataset.l === kind);
  for (const p of ps) { if (off) delete p.dataset.l; else p.dataset.l = kind; }
  return true;
}

/** What's on what's picked: bold, italic, underlined, struck through, the caret's paragraph's level and list. */
export function richState(): { b: boolean; i: boolean; u: boolean; x: boolean; h: number; l: string | undefined } | null {
  if (!active) return null;
  const q = (c: string) => { try { return document.queryCommandState(c); } catch { return false; } };
  const p = pickedParagraphs()[0], h = Number(p?.dataset.h) || 0;
  return { b: h ? false : q('bold'), i: q('italic'), u: q('underline'), x: q('strikeThrough'), h, l: p?.dataset.l };
}

export function RichEditor({ editor, item }: { editor: Editor; item: Item }) {
  const ref = useRef<HTMLDivElement>(null), done = useRef(false), plain = useRef(false), id = item.id, fs = item.fs ?? 16;

  /** Done with it: its text and styles kept (as typed text is, see commitText). */
  const commit = () => {
    const el = ref.current;
    if (done.current || !el) return;
    done.current = true;
    const { text, rs } = fromDom(el, getComputedStyle(el).color);
    editor.board.update(id, { text, rs });
    editor.commitText(id, text);
  };

  useLayoutEffect(() => {
    const el = ref.current!;
    el.innerHTML = toHtml(item);
    active = { el, fs, range: null };
    document.execCommand('defaultParagraphSeparator', false, 'div');
    el.focus();
    // The caret at its end (or all of it picked, as text opened for typing has it).
    const sel = getSelection(), r = document.createRange();
    r.selectNodeContents(el);
    if (editor.editCaret === 'end') r.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(r);
    // What's picked in it kept, for the panel's buttons to work on after a press there.
    const keep = () => { const s = getSelection(); if (active && s?.rangeCount && el.contains(s.anchorNode)) active.range = s.getRangeAt(0).cloneRange(); };
    document.addEventListener('selectionchange', keep);
    const onCommit = () => commit();
    window.addEventListener('planx:commit-edit', onCommit);
    return () => {
      document.removeEventListener('selectionchange', keep);
      window.removeEventListener('planx:commit-edit', onCommit);
      commit();
      if (active?.el === el) active = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const z = editor.cam.z, p = editor.toScreen({ x: item.x + PAGE.LEFT, y: item.y + PAGE.TOP }), st = fontOf(item);
  return (
    <div ref={ref} className="rich-edit" contentEditable suppressContentEditableWarning spellCheck={false} role="textbox" aria-multiline aria-label="Текст документа"
      style={{
        left: p.x, top: p.y, width: PAGE_TEXT.w, height: PAGE_TEXT.h, transform: `scale(${z})`,
        fontSize: fs, lineHeight: LINE_HEIGHT, fontWeight: st.weight, fontStyle: st.italic ? 'italic' : undefined,
        fontFamily: FONTS[st.family ?? 'onest']?.css, color: item.tc ? cssColor(item.tc) : undefined, textAlign: item.ta ?? 'left',
      }}
      onBlur={commit}
      onPaste={(e) => {
        // Pasted with what a document has of its styling (cleanPaste); Cmd+Shift+V (or nothing but text
        // copied) as plain text.
        // (Taken here alone: not on to the board, which would paste it there too.)
        e.preventDefault();
        e.stopPropagation();
        const html = plain.current ? '' : e.clipboardData.getData('text/html');
        plain.current = false;
        const clean = html && cleanPaste(html, fs), tpl = document.createElement('div');
        tpl.innerHTML = clean || '';
        const blocks = [...tpl.children] as HTMLElement[];
        if (blocks.length === 1 && blocks[0].dataset.h === '0') document.execCommand('insertHTML', false, blocks[0].innerHTML);
        else if (blocks.length && ref.current) {
          // Paragraphs, or a heading: put in as paragraphs of their own where the caret is (the paragraph
          // it's in split there), the caret after them.
          const root = ref.current;
          if (!getSelection()?.isCollapsed) document.execCommand('delete');
          document.execCommand('insertParagraph');
          const after = paragraphAt(root), before = after?.previousElementSibling;
          blocks.forEach((b) => root.insertBefore(b, after ?? null));
          if (before && !before.textContent) before.remove();
          if (after && !after.textContent) after.remove();
          const last = blocks[blocks.length - 1], r = document.createRange();
          r.selectNodeContents(last);
          r.collapse(false);
          getSelection()?.removeAllRanges();
          getSelection()?.addRange(r);
        }
        else document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
      onInput={() => {
        // A new paragraph after a heading (Enter at its end): plain text.
        const s = getSelection(), el = ref.current;
        let n: Node | null = s?.anchorNode ?? null;
        while (n && n.parentNode !== el) n = n.parentNode;
        const para = n as HTMLElement | null;
        if (para?.dataset && para.dataset.h !== '0' && !para.textContent && para.previousElementSibling) { para.dataset.h = '0'; para.removeAttribute('style'); }
      }}
      onKeyDown={(e) => {
        // In a list: Enter in an empty item ends the list there, Backspace at an item's start takes it out
        // of the list (as in Word).
        const para = ref.current && paragraphAt(ref.current), sel = getSelection();
        const atStart = !!para && !!sel?.isCollapsed && (() => { const r = document.createRange(); r.selectNodeContents(para); r.setEnd(sel.anchorNode!, sel.anchorOffset); return !r.toString(); })();
        if (para?.dataset.l && ((e.key === 'Enter' && !e.shiftKey && !para.textContent) || (e.key === 'Backspace' && atStart))) {
          e.preventDefault();
          delete para.dataset.l;
          return;
        }
        if (e.key === 'Escape') { e.preventDefault(); commit(); }
        else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); editor.setSelection([]); }
        else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyX') { e.preventDefault(); richStyle('x'); }
        // (Cmd+Shift+V: the paste that comes next as plain text.)
        else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyV') plain.current = true;
      }}
    />
  );
}
