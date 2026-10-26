/**
 * Card placement next to a highlighted target. Works in physical viewport coordinates
 * (getBoundingClientRect is physical) but chooses sides logically: "end" is right in LTR and
 * left in RTL, and the card aligns with the target's reading-start edge. No hard-coded
 * `left: 20px` assumptions (doc 09 §6).
 */
export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type Side = 'bottom' | 'top' | 'end' | 'start';

export interface Placement {
  top: number;
  left: number;
  side: Side | 'center';
  /** Offset of the pointer along the card edge (px from the card's left), when attached. */
  arrow?: number;
}

const MARGIN = 12;
const GAP = 16;

export function placeCard(
  target: Box | null,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  dir: 'ltr' | 'rtl',
): Placement {
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), viewport.width - card.width - MARGIN);
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), viewport.height - card.height - MARGIN);
  if (!target) {
    return { side: 'center', left: clampX((viewport.width - card.width) / 2), top: clampY((viewport.height - card.height) / 2) };
  }
  const right = target.left + target.width;
  const bottom = target.top + target.height;
  const alignedX = clampX(dir === 'rtl' ? right - card.width : target.left);
  const centerX = target.left + target.width / 2;
  const arrowFor = (left: number) => Math.min(Math.max(centerX - left, 20), card.width - 20);

  const below = bottom + GAP;
  if (below + card.height <= viewport.height - MARGIN) return { side: 'bottom', top: below, left: alignedX, arrow: arrowFor(alignedX) };

  const above = target.top - GAP - card.height;
  if (above >= MARGIN) return { side: 'top', top: above, left: alignedX, arrow: arrowFor(alignedX) };

  const endX = dir === 'rtl' ? target.left - GAP - card.width : right + GAP;
  if (endX >= MARGIN && endX + card.width <= viewport.width - MARGIN) {
    return { side: 'end', left: endX, top: clampY(target.top) };
  }
  const startX = dir === 'rtl' ? right + GAP : target.left - GAP - card.width;
  if (startX >= MARGIN && startX + card.width <= viewport.width - MARGIN) {
    return { side: 'start', left: startX, top: clampY(target.top) };
  }
  return { side: 'center', left: clampX((viewport.width - card.width) / 2), top: clampY(viewport.height - card.height - MARGIN) };
}

/** On phones the card is a sheet on the edge away from the target, so it never covers it. */
export function sheetEdge(target: Box | null, viewportHeight: number): 'top' | 'bottom' {
  if (!target) return 'bottom';
  return target.top + target.height / 2 > viewportHeight / 2 ? 'top' : 'bottom';
}
