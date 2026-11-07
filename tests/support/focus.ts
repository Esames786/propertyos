import type { Locator, Page } from '@playwright/test';

/**
 * Issue #20 (B2 observation N-B2-1): is a keyboard focus ring really drawn? Three independent reads:
 * 1. the computed style of the focused element (outline style, width, offset, colour);
 * 2. the rendered pixels: the band where the outline is painted is captured before focus and with
 *    keyboard focus, and each pixel's contrast between the two states is measured (WCAG 2.4.13's
 *    "change of contrast" method, which also catches a ring that is clipped, covered or off screen);
 * 3. every other element drawing an outline at the same time (one clear ring, not two).
 */
export interface RingReport {
  focused: boolean;
  /** :focus-visible or React Aria's data-focus-visible on the focused element. */
  focusVisible: boolean;
  style: string;
  width: number;
  offset: number;
  colour: string;
  /** Other elements drawing an outline at the same moment (selector-ish descriptions). */
  otherRings: string[];
  /** Pixels sampled on the straight edges of the outline band. */
  pixels: number;
  /** Share of sampled pixels whose focused colour differs from the unfocused one by at least 3:1. */
  changed3: number;
  /** Median contrast between the focused and the unfocused colour of the sampled pixels. */
  median: number;
  /**
   * Share of the ring's path cut off by an ancestor that clips (overflow other than visible). Only the
   * visible part is sampled above; a part beyond the screen edge is not sampled and not counted.
   */
  clipped: number;
}

/** Keyboard modality, then focus: React Aria and the browser both treat it as keyboard focus. */
export async function keyboardFocus(page: Page, target: Locator) {
  await page.keyboard.press('Tab');
  await target.focus();
}

/**
 * Nothing focused (and nothing hovered). Inside a modal, blurring hands focus straight back (React Aria
 * contains it), so the dialog element itself takes focus instead (it draws no ring).
 */
export async function clearFocus(page: Page) {
  await page.mouse.move(0, 0);
  await unfocus(page);
}

async function unfocus(page: Page) {
  await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    const dialog = el?.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    if (dialog && dialog !== el) dialog.focus({ preventScroll: true });
    else el?.blur();
  });
}

async function geometry(target: Locator) {
  return target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const radius = Math.max(...[cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map((v) => parseFloat(v) || 0));
    // Clipping by ancestors only: a control taller than the screen (a tab panel) runs past its edges, which
    // scrolling reveals; that part is simply not sampled (it is not in the screenshot).
    let clip = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
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
    return { x: r.left, y: r.top, w: r.width, h: r.height, radius: Math.min(radius, r.width / 2, r.height / 2), vw: document.documentElement.clientWidth, vh: window.innerHeight, clip };
  });
}

/** The viewport as a screenshot. */
async function capture(page: Page) {
  return { png: (await page.screenshot({ animations: 'disabled', caret: 'hide' })).toString('base64') };
}

/**
 * Where client coordinates land in a viewport screenshot. They normally coincide, but a right-to-left
 * page that overflows sideways (320 px at 200 %, Urdu: N-B2-2) is captured shifted by the overflow.
 * A 3 × 3 marker is put at a known client position, found in a screenshot, and removed.
 */
async function screenshotOffset(page: Page, decoder: Page) {
  await page.evaluate(() => {
    const m = document.createElement('div');
    m.id = '__ring_marker';
    m.style.cssText = 'position:fixed;left:7px;top:7px;width:3px;height:3px;background:#ff00ff;z-index:2147483647;pointer-events:none';
    document.body.append(m);
  });
  const shot = await capture(page);
  await page.evaluate(() => document.getElementById('__ring_marker')?.remove());
  return decoder.evaluate(async (b64) => {
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
  }, shot.png);
}

/** Decodes two PNGs in a blank page and compares the outline band pixel by pixel. */
async function compareBand(decoder: Page, before: string, after: string, band: { ox: number; oy: number; outer: number; inner: number; w: number; h: number; radius: number; clip: { l: number; t: number; r: number; b: number } }) {
  return decoder.evaluate(
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
      const lum = (r: number, g: number, bl: number) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
      };
      const contrasts: number[] = [];
      const at = (img: typeof a, x: number, y: number) => {
        const i = (y * img.w + x) * 4;
        return lum(img.d[i]!, img.d[i + 1]!, img.d[i + 2]!);
      };
      // One sample: the strongest before/after change at the point and its four neighbours (a 2 px
      // ring on a fractional pixel position is anti-aliased across two rows or columns).
      const seen = new Set<string>();
      let path = 0;
      let hidden = 0;
      const take = (px: number, py: number) => {
        const cx = Math.floor(px);
        const cy = Math.floor(py);
        const key = `${cx},${cy}`;
        if (seen.has(key)) return;
        seen.add(key);
        path++;
        // The clip box is in the same (shifted) coordinates; a point outside it cannot be painted.
        if (px < band.clip.l || px >= band.clip.r || py < band.clip.t || py >= band.clip.b) {
          hidden++;
          return;
        }
        let best = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= a.w || y >= a.h || x >= b.w || y >= b.h) continue;
          const [l1, l2] = [at(a, x, y), at(b, x, y)];
          best = Math.max(best, (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
        }
        if (best) contrasts.push(best);
      };
      // Element box inside the capture: origin (ox, oy), size w × h. The outline's middle line runs at
      // `mid` outside the box (negative: inside, an inset ring) and follows the corner radius, so the
      // path is a rounded rectangle (a circle for a round button). It is walked one pixel at a time.
      const mid = (band.inner + band.outer) / 2;
      const R = Math.max(0, band.radius + mid);
      const [l, t, r, btm] = [band.ox - mid, band.oy - mid, band.ox + band.w + mid, band.oy + band.h + mid];
      for (let x = l + R; x <= r - R; x++) {
        take(x, t);
        take(x, btm);
      }
      for (let y = t + R; y <= btm - R; y++) {
        take(l, y);
        take(r, y);
      }
      if (R > 0) {
        const steps = Math.max(8, Math.ceil(R * 2));
        for (const [cx, cy, from] of [[l + R, t + R, Math.PI], [r - R, t + R, 1.5 * Math.PI], [r - R, btm - R, 0], [l + R, btm - R, 0.5 * Math.PI]] as const) {
          for (let k = 0; k <= steps; k++) {
            const ang = from + (k / steps) * (Math.PI / 2);
            take(cx + R * Math.cos(ang), cy + R * Math.sin(ang));
          }
        }
      }
      contrasts.sort((p, q) => p - q);
      return {
        pixels: contrasts.length,
        changed3: contrasts.length ? contrasts.filter((c) => c >= 3).length / contrasts.length : 0,
        median: contrasts.length ? Math.round(contrasts[Math.floor(contrasts.length / 2)]! * 100) / 100 : 0,
        clipped: path ? Math.round((hidden / path) * 100) / 100 : 0,
      };
    },
    { before, after, band },
  );
}

/**
 * Measures `target` unfocused, then with keyboard focus (or with `how: 'pointer'`, pressed with the
 * mouse without releasing on it, which focuses without activating). `decoder` is a blank page of the
 * same browser used to decode screenshots.
 */
export async function ringOf(page: Page, decoder: Page, target: Locator, how: 'keyboard' | 'pointer' = 'keyboard'): Promise<RingReport> {
  await clearFocus(page);
  await target.scrollIntoViewIfNeeded();
  // Focus first (focusing may scroll), then measure and capture; the unfocused capture is taken after
  // blurring, at the same scroll position, so both captures show the same box.
  if (how === 'keyboard') await keyboardFocus(page, target);
  else {
    const p = (await geometry(target))!;
    await page.mouse.move(p.x + p.w / 2, p.y + p.h / 2);
    await page.mouse.down();
  }
  const g = await geometry(target);
  const state = await target.evaluate((el) => {
    const cs = getComputedStyle(el);
    const rings: string[] = [];
    for (const other of document.querySelectorAll<HTMLElement>('body *')) {
      if (other === el) continue;
      const o = getComputedStyle(other);
      const r = other.getBoundingClientRect();
      if (o.outlineStyle !== 'none' && parseFloat(o.outlineWidth) > 0 && r.width > 0 && r.height > 0 && o.visibility !== 'hidden') {
        rings.push(`${other.tagName.toLowerCase()}${other.getAttribute('role') ? `[role=${other.getAttribute('role')}]` : ''}${other.dataset.testid ? `[${other.dataset.testid}]` : ''}.${String(other.className).split(' ').slice(0, 3).join('.')}`);
      }
    }
    return {
      focused: document.activeElement === el,
      focusVisible: el.matches(':focus-visible') || el.hasAttribute('data-focus-visible'),
      style: cs.outlineStyle,
      width: parseFloat(cs.outlineWidth) || 0,
      offset: parseFloat(cs.outlineOffset) || 0,
      colour: cs.outlineColor,
      otherRings: rings,
    };
  });
  // Screenshot pixels per CSS pixel (2 for the WebKit project's Desktop Safari), and where client
  // coordinates land in the screenshot.
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const marker = await screenshotOffset(page, decoder);
  const shift = marker ? { dx: marker.x - 7 * dpr, dy: marker.y - 7 * dpr } : { dx: 0, dy: 0 };
  const after = await capture(page);
  if (how === 'pointer') {
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }
  await unfocus(page);
  const before = await capture(page);
  const width = state.style === 'none' ? 2 : state.width;
  const offset = state.style === 'none' ? 2 : state.offset;
  const band = await compareBand(decoder, before.png, after.png, {
    ox: g.x * dpr + shift.dx,
    oy: g.y * dpr + shift.dy,
    clip: { l: g.clip.l * dpr + shift.dx, t: g.clip.t * dpr + shift.dy, r: g.clip.r * dpr + shift.dx, b: g.clip.b * dpr + shift.dy },
    inner: offset * dpr,
    outer: (offset + width) * dpr,
    w: g.w * dpr,
    h: g.h * dpr,
    radius: g.radius * dpr,
  });
  return { ...state, ...band };
}

/** WCAG contrast of the outline colour against a background colour (both computed `rgb(...)`). */
export function contrastOf(a: string, b: string) {
  const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]: number[]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(bl!);
  };
  const [l1, l2] = [lum(rgb(a)), lum(rgb(b))];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
