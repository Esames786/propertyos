/**
 * Stable semantic anchors (doc 09 §8): `data-tour-id`, never CSS classes or nth-child selectors.
 * Spread `tourAnchor('quick-create')` onto the element a tour step should highlight.
 */
export function tourAnchor(id: string): { 'data-tour-id': string } {
  return { 'data-tour-id': id };
}

/** True if the element is rendered, has a box, is not hidden and not inside an inert subtree. */
export function isUsableAnchor(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('[inert],[aria-hidden="true"]')) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

/** Finds the first visible element for an anchor id (desktop and phone variants may both exist). */
export function findAnchor(id: string): HTMLElement | null {
  for (const el of document.querySelectorAll(`[data-tour-id="${CSS.escape(id)}"]`)) {
    if (isUsableAnchor(el)) return el;
  }
  return null;
}

/** Waits for an anchor to render (e.g. after navigation or a drawer opening), up to a timeout. */
export function waitForAnchor(id: string, timeoutMs: number, signal: AbortSignal): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const found = findAnchor(id);
    if (found) return resolve(found);
    const observer = new MutationObserver(() => {
      const el = findAnchor(id);
      if (el) finish(el);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
    const finish = (el: HTMLElement | null) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(el);
    };
    signal.addEventListener('abort', () => finish(null));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'inert'] });
  });
}
