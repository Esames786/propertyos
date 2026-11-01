import type { Locator, Page } from '@playwright/test';

/**
 * Element-level layout checks (Gate D.2 review, Issue #8): a page can have no sideways scroll and no
 * axe finding and still clip a figure or squeeze a title into one character per line. These checks
 * read the rendered boxes: each text-bearing element and control against the viewport and against
 * the nearest ancestor that clips it, each control's text against the control, and each word's
 * rendered lines.
 */
export interface LayoutProblem {
  kind: 'offscreen' | 'clipped' | 'spills' | 'broken-word';
  text: string;
  detail: string;
}

export async function layoutProblems(scope: Page | Locator): Promise<LayoutProblem[]> {
  const root = 'goto' in scope ? scope.locator('main') : scope;
  return root.first().evaluate((rootEl: Element) => {
    const problems: Array<{ kind: 'offscreen' | 'clipped' | 'spills' | 'broken-word'; text: string; detail: string }> = [];
    const vw = document.documentElement.clientWidth;
    const short = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 60);
    /** Hidden on purpose: aria-hidden, sr-only, or inside a visually hidden box (React Aria's 1 × 1 clipped wrapper). */
    const hiddenByCss = (el: Element) => {
      if (el.closest('[aria-hidden="true"], .sr-only, [hidden]')) return true;
      for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        const r = p.getBoundingClientRect();
        if ((cs.clip !== 'auto' && cs.clip !== '') || /inset\(50%\)/.test(cs.clipPath) || (r.width <= 1 && r.height <= 1 && cs.overflow !== 'visible')) return true;
      }
      return false;
    };
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && !hiddenByCss(el);
    };
    const clipperOf = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/hidden|clip/.test(cs.overflowX)) return p;
      }
      return null;
    };
    const ownText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim());
    const controls = 'a[href], button, input, select, textarea, [role="button"], [role="link"]';

    for (const el of [rootEl, ...rootEl.querySelectorAll('*')]) {
      if (!shown(el) || !(ownText(el) || el.matches(controls))) continue;
      const r = el.getBoundingClientRect();
      const label = short((el as HTMLElement).innerText || el.getAttribute('aria-label') || el.tagName);
      if (r.right > vw + 1 || r.left < -1) problems.push({ kind: 'offscreen', text: label, detail: `x ${Math.round(r.left)}–${Math.round(r.right)} in a ${vw}px viewport` });
      const clip = clipperOf(el);
      if (clip) {
        const c = clip.getBoundingClientRect();
        if (r.right > c.right + 1 || r.left < c.left - 1) problems.push({ kind: 'clipped', text: label, detail: `x ${Math.round(r.left)}–${Math.round(r.right)} outside its clipping box ${Math.round(c.left)}–${Math.round(c.right)}` });
      }
      if (/hidden|clip/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1) problems.push({ kind: 'clipped', text: label, detail: `content ${el.scrollWidth}px in a ${el.clientWidth}px box` });
      if (el.matches(controls) && !el.matches('input, select, textarea')) {
        // Only text that is shown counts (an sr-only phrase is laid out on one line inside a 1 px box).
        let left = Infinity;
        let right = -Infinity;
        const texts = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = texts.nextNode(); n; n = texts.nextNode()) {
          if (!n.parentElement || !(n.textContent ?? '').trim() || !shown(n.parentElement)) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const x of range.getClientRects()) {
            if (x.width < 0.5) continue;
            left = Math.min(left, x.left);
            right = Math.max(right, x.right);
          }
        }
        if (right > left && (right > r.right + 1 || left < r.left - 1)) problems.push({ kind: 'spills', text: label, detail: `text ${Math.round(left)}–${Math.round(right)} outside the control ${Math.round(r.left)}–${Math.round(r.right)}` });
      }
    }

    // Words split over lines although the page column could hold them whole.
    const column = rootEl.getBoundingClientRect().width;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !shown(parent)) continue;
      const text = node.textContent ?? '';
      for (const m of text.matchAll(/\S{2,}/g)) {
        const range = document.createRange();
        range.setStart(node, m.index!);
        range.setEnd(node, m.index! + m[0].length);
        const rects = [...range.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5);
        if (rects.length < 2) continue;
        const lines: number[] = [];
        for (const x of rects) if (!lines.some((top) => Math.abs(top - x.top) < x.height / 2)) lines.push(x.top);
        const width = rects.reduce((sum, x) => sum + x.width, 0);
        if (lines.length > 1 && width < column * 0.75) problems.push({ kind: 'broken-word', text: m[0], detail: `on ${lines.length} lines, ${Math.round(width)}px wide in a ${Math.round(column)}px column` });
      }
    }
    return problems;
  });
}

/** Rendered lines of an element's text (line boxes, not characters). */
export async function linesOf(el: Locator): Promise<number> {
  return el.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const lines: number[] = [];
    for (const x of range.getClientRects()) if (x.width > 0.5 && !lines.some((top) => Math.abs(top - x.top) < x.height / 2)) lines.push(x.top);
    return lines.length;
  });
}

export interface FocusStop {
  label: string;
  /** 'hidden': entirely under the header or the bottom bar; 'partial': partly, although it would fit. */
  issue?: 'hidden' | 'partial';
  detail?: string;
}

/**
 * Walks the page with Tab (the browser scrolls each control into view, with the page's scroll padding)
 * and checks every focused control in the content against the sticky header above and the fixed bottom
 * bar below in the real viewport. Controls inside the header or the bar themselves are skipped.
 */
export async function focusWalk(page: Page, options: { header: string; bar: string; max?: number }): Promise<FocusStop[]> {
  const stops: FocusStop[] = [];
  const seen = new Set<string>();
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  for (let i = 0; i < (options.max ?? 80); i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(({ header, bar }) => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const h = document.querySelector(header);
      const b = document.querySelector(bar);
      if (h?.contains(el) || b?.contains(el)) return { key: `chrome:${el.outerHTML.slice(0, 80)}`, skip: true } as const;
      const r = el.getBoundingClientRect();
      const label = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('data-testid') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
      const key = `${el.tagName}:${el.getAttribute('data-testid') ?? ''}:${label}:${Math.round(r.top + window.scrollY)}`;
      // What is really on top, point by point (z-order included): a grid of points over the control.
      let clear = 0;
      let total = 0;
      for (const fx of [0.1, 0.35, 0.65, 0.9]) {
        for (const fy of [0.15, 0.5, 0.85]) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          total++;
          if (y < 0 || y > window.innerHeight || x < 0 || x > window.innerWidth) continue;
          const hit = document.elementFromPoint(x, y);
          const covered = !!hit && !el.contains(hit) && (!!h?.contains(hit) || !!b?.contains(hit));
          if (!covered) clear++;
        }
      }
      const room = window.innerHeight - (h ? Math.max(0, h.getBoundingClientRect().bottom) : 0) - (b ? b.getBoundingClientRect().height : 0);
      const issue = clear === 0 ? 'hidden' : clear < total && r.height <= room ? 'partial' : undefined;
      return { key, skip: false, label, issue, detail: `control ${Math.round(r.top)}–${Math.round(r.bottom)}: ${total - clear} of ${total} points under the header, the bar or off screen` } as const;
    }, options);
    if (!stop) continue;
    if (seen.has(stop.key)) break;
    seen.add(stop.key);
    if (stop.skip) continue;
    stops.push({ label: stop.label, ...(stop.issue ? { issue: stop.issue, detail: stop.detail } : {}) });
  }
  return stops;
}
