import type { Locator, Page } from '@playwright/test';

/**
 * B10 (GitHub Issue #24, F-INT-3): the keyboard ring of the element that has focus **now**, measured where
 * keyboard navigation left it. Nothing is scrolled or refocused before the capture, so a ring that Tab
 * brought only partly into view is measured as the person sees it. Unlike `ringOf` (tests/support/focus.ts,
 * which is unchanged and still used beside this), every border of the ring is reported on its own (top,
 * bottom, start, end), and a point outside the screen counts as hidden as well as one outside a clipping
 * ancestor, so "the whole ring is visible" can be asserted per border.
 *
 * Method (as ringOf, WCAG 2.4.13 "change of contrast"): the screen is captured with the focus, then with the
 * focus moved to the surrounding dialog (or the document) without scrolling; each point on the middle line
 * of the outline band is compared between the two captures (the strongest change at the point and its four
 * neighbours), and must change by at least 3:1. Afterwards the focus is put back, without scrolling, so a
 * Tab or Shift+Tab continues from the same control.
 */
export interface EdgeReport {
  /** Points on this border's middle line. */
  points: number;
  /** Points outside the screen or outside a clipping ancestor (they cannot be seen). */
  hidden: number;
  /** Share of all points (hidden ones count as unchanged) whose focused colour differs by at least 3:1. */
  changed3: number;
  median: number;
}

export interface EdgesReport {
  /** The focused element, described. */
  name: string;
  focusVisible: boolean;
  style: string;
  width: number;
  offset: number;
  /** Scroll offsets of every scrolled container, focused and unfocused (must be equal). */
  scroll: [string, string];
  edges: { top: EdgeReport; bottom: EdgeReport; start: EdgeReport; end: EdgeReport };
}

async function shot(page: Page) {
  return (await page.screenshot({ animations: 'disabled', caret: 'hide' })).toString('base64');
}

/** Where client coordinates land in the screenshot (a right-to-left page that overflows sideways is shifted). */
async function shift(page: Page, decoder: Page) {
  await page.evaluate(() => {
    const m = document.createElement('div');
    m.id = '__edge_marker';
    m.style.cssText = 'position:fixed;left:7px;top:7px;width:3px;height:3px;background:#ff00ff;z-index:2147483647;pointer-events:none';
    document.body.append(m);
  });
  const png = await shot(page);
  await page.evaluate(() => document.getElementById('__edge_marker')?.remove());
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const at = await decoder.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, Math.min(60, img.width), Math.min(60, img.height));
    for (let y = 0; y < d.height; y++)
      for (let x = 0; x < d.width; x++) {
        const i = (y * d.width + x) * 4;
        if (d.data[i]! > 240 && d.data[i + 1]! < 20 && d.data[i + 2]! > 240) return { x, y };
      }
    return null;
  }, png);
  return { dpr, dx: at ? at.x - 7 * dpr : 0, dy: at ? at.y - 7 * dpr : 0 };
}

/** Scroll offsets of every element that is scrolled (a dialog's overlay, the page). */
const scrolls = (page: Page) =>
  page.evaluate(() =>
    [document.scrollingElement!, ...document.querySelectorAll('*')]
      .filter((el) => el.scrollTop || el.scrollLeft)
      .map((el) => `${el.tagName.toLowerCase()}:${Math.round(el.scrollLeft)},${Math.round(el.scrollTop)}`)
      .join(' '),
  );

/** Measures the ring of the element that has focus now (see the module comment). */
export async function edgesOfFocused(page: Page, decoder: Page): Promise<EdgesReport> {
  const g = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const radius = Math.max(...[cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map((v) => parseFloat(v) || 0));
    // What can be seen: the screen, cut by every ancestor that clips (overflow other than visible).
    let clip = { l: 0, t: 0, r: document.documentElement.clientWidth, b: window.innerHeight };
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflowX === 'visible' && ps.overflowY === 'visible') continue;
      const q = p.getBoundingClientRect();
      clip = {
        l: ps.overflowX === 'visible' ? clip.l : Math.max(clip.l, q.left),
        t: ps.overflowY === 'visible' ? clip.t : Math.max(clip.t, q.top),
        r: ps.overflowX === 'visible' ? clip.r : Math.min(clip.r, q.right),
        b: ps.overflowY === 'visible' ? clip.b : Math.min(clip.b, q.bottom),
      };
    }
    const name = (el.innerText || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
    return {
      name,
      rtl: getComputedStyle(el).direction === 'rtl',
      focusVisible: el.matches(':focus-visible') || el.hasAttribute('data-focus-visible'),
      style: cs.outlineStyle,
      width: parseFloat(cs.outlineWidth) || 0,
      offset: parseFloat(cs.outlineOffset) || 0,
      box: { x: r.left, y: r.top, w: r.width, h: r.height, radius: Math.min(radius, r.width / 2, r.height / 2) },
      clip,
    };
  });
  const s = await shift(page, decoder);
  const scrollFocused = await scrolls(page);
  const after = await shot(page);
  // Focus to the surrounding dialog (it draws no ring) or nowhere, without scrolling; capture; then back.
  await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    (window as unknown as { __edgeTarget: HTMLElement }).__edgeTarget = el;
    const dialog = el.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    if (dialog && dialog !== el) dialog.focus({ preventScroll: true });
    else el.blur();
  });
  const scrollUnfocused = await scrolls(page);
  const before = await shot(page);
  await page.evaluate(() => (window as unknown as { __edgeTarget: HTMLElement }).__edgeTarget.focus({ preventScroll: true }));

  const k = s.dpr;
  const band = {
    ox: g.box.x * k + s.dx,
    oy: g.box.y * k + s.dy,
    w: g.box.w * k,
    h: g.box.h * k,
    radius: g.box.radius * k,
    mid: (g.offset + g.width / 2) * k,
    clip: { l: g.clip.l * k + s.dx, t: g.clip.t * k + s.dy, r: g.clip.r * k + s.dx, b: g.clip.b * k + s.dy },
  };
  const edges = await decoder.evaluate(
    async ({ before, after, band }) => {
      const load = async (b64: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, d: ctx.getImageData(0, 0, img.width, img.height).data };
      };
      const [a, b] = [await load(before), await load(after)];
      const lum = (img: typeof a, x: number, y: number) => {
        const i = (y * img.w + x) * 4;
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(img.d[i]!) + 0.7152 * f(img.d[i + 1]!) + 0.0722 * f(img.d[i + 2]!);
      };
      const edge = (points: Array<[number, number]>) => {
        let hidden = 0;
        const contrasts: number[] = [];
        for (const [px, py] of points) {
          const [cx, cy] = [Math.floor(px), Math.floor(py)];
          if (px < band.clip.l || px >= band.clip.r || py < band.clip.t || py >= band.clip.b || cx < 0 || cy < 0 || cx >= a.w || cy >= a.h) {
            hidden++;
            contrasts.push(1);
            continue;
          }
          let best = 1;
          for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const [x, y] = [cx + dx, cy + dy];
            if (x < 0 || y < 0 || x >= a.w || y >= a.h) continue;
            const [l1, l2] = [lum(a, x, y), lum(b, x, y)];
            best = Math.max(best, (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
          }
          contrasts.push(best);
        }
        const sorted = [...contrasts].sort((p, q) => p - q);
        return {
          points: points.length,
          hidden,
          changed3: points.length ? contrasts.filter((c) => c >= 3).length / points.length : 0,
          median: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]! * 100) / 100 : 0,
        };
      };
      // The outline's middle line, `mid` outside the box, straight parts only (corners follow the radius).
      const { ox, oy, w, h, radius, mid } = band;
      const [l, t, r, btm] = [ox - mid, oy - mid, ox + w + mid, oy + h + mid];
      const R = Math.max(0, radius + mid);
      const across: Array<[number, number]>[] = [[], []];
      for (let x = l + R; x <= r - R; x++) {
        across[0]!.push([x, t]);
        across[1]!.push([x, btm]);
      }
      const down: Array<[number, number]>[] = [[], []];
      for (let y = t + R; y <= btm - R; y++) {
        down[0]!.push([l, y]);
        down[1]!.push([r, y]);
      }
      return { top: edge(across[0]!), bottom: edge(across[1]!), left: edge(down[0]!), right: edge(down[1]!) };
    },
    { before, after, band },
  );
  return {
    name: g.name,
    focusVisible: g.focusVisible,
    style: g.style,
    width: g.width,
    offset: g.offset,
    scroll: [scrollFocused, scrollUnfocused],
    edges: { top: edges.top, bottom: edges.bottom, start: g.rtl ? edges.right : edges.left, end: g.rtl ? edges.left : edges.right },
  };
}

/** One line per measurement, for the test's attachment. */
export const describeEdges = (label: string, r: EdgesReport) =>
  `${label} "${r.name}": ${r.style} ${r.width}px offset ${r.offset}; ` +
  (['top', 'bottom', 'start', 'end'] as const).map((e) => `${e} ${r.edges[e].points} pts, hidden ${r.edges[e].hidden}, ${Math.round(r.edges[e].changed3 * 100)} % ≥ 3:1, median ${r.edges[e].median}:1`).join('; ') +
  `; scroll ${r.scroll[0] || 'none'}`;

/** The whole ring is visible: solid, at least 2 px, and on every border nothing hidden and ≥ 90 % of points changed by ≥ 3:1 (B2's threshold). */
export function ringProblems(r: EdgesReport, min = 0.9): string[] {
  const out: string[] = [];
  if (!r.focusVisible) out.push('not focus-visible');
  if (r.style !== 'solid') out.push(`outline style ${r.style}`);
  if (r.width < 2) out.push(`outline width ${r.width}`);
  if (r.scroll[0] !== r.scroll[1]) out.push(`scrolled between captures (${r.scroll[0]} / ${r.scroll[1]})`);
  for (const e of ['top', 'bottom', 'start', 'end'] as const) {
    const x = r.edges[e];
    if (x.points < 4) out.push(`${e}: only ${x.points} points sampled`);
    if (x.hidden) out.push(`${e}: ${x.hidden} of ${x.points} points hidden (off screen or clipped)`);
    if (x.changed3 < min) out.push(`${e}: ${Math.round(x.changed3 * 100)} % changed by ≥ 3:1`);
    if (x.median < 3) out.push(`${e}: median ${x.median}:1`);
  }
  return out;
}

/** The focused element (for asserting which control a Tab reached). */
export const focusedName = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  return el ? (el.innerText || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ') : '';
});

/** Every StatTile label on the page (B10, F-INT-1): what is drawn of it, measured against its own box, its tile and the screen. */
export async function statTileLabels(scope: Page | Locator) {
  const root = 'goto' in scope ? scope.locator('main') : scope;
  return root.first().evaluate((main) =>
    [...main.querySelectorAll<HTMLElement>('[data-stat-label]')].map((s) => {
      const tile = s.closest('a')!;
      const cs = getComputedStyle(s);
      const box = s.getBoundingClientRect();
      const t = tile.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(s);
      const rects = [...range.getClientRects()].filter((x) => x.width > 0.5);
      const text = {
        l: Math.min(...rects.map((x) => x.left)),
        r: Math.max(...rects.map((x) => x.right)),
        t: Math.min(...rects.map((x) => x.top)),
        b: Math.max(...rects.map((x) => x.bottom)),
      };
      const across = (o: { left: number; right: number }) => text.l >= o.left - 1 && text.r <= o.right + 1;
      const inside = (o: { left: number; right: number; top: number; bottom: number }) => across(o) && text.t >= o.top - 1 && text.b <= o.bottom + 1;
      // The badge row: the label's group and the change badge (if any) share one line, or the badge moved below.
      const header = s.parentElement!.parentElement!;
      const badge = header.querySelector(':scope > [aria-hidden]');
      return {
        id: tile.getAttribute('data-testid') ?? '',
        name: tile.getAttribute('aria-label') ?? '',
        text: (s.innerText ?? '').trim(),
        lineClamp: cs.webkitLineClamp,
        overflow: `${cs.overflowX} ${cs.overflowY}`,
        textOverflow: cs.textOverflow,
        scroll: { sh: s.scrollHeight, ch: s.clientHeight, sw: s.scrollWidth, cw: s.clientWidth },
        lines: new Set(rects.map((x) => Math.round(x.top))).size,
        // Sideways within the label's own width (a word wider than the label would run out of it). Not
        // vertically: Firefox reports each line's font content area, which for Urdu is taller than the line
        // box (38.5 px lines, 48 px rects at 200 %); the label does not clip (asserted separately), so that is
        // drawn, not cut.
        inLabel: across(box),
        // Wholly within the tile, which clips (overflow hidden): nothing of the text is cut by it.
        inTile: inside(t),
        onScreen: text.l >= -1 && text.r <= document.documentElement.clientWidth + 1,
        badgeBeside: badge ? Math.abs(badge.getBoundingClientRect().top - header.getBoundingClientRect().top) < 1 : null,
      };
    }),
  );
}
