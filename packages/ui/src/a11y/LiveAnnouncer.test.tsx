import { afterEach, describe, expect, it } from 'vitest';
import { resolveReferenceAnnouncements } from './LiveAnnouncer';

/** React Aria's live region, as its announcer builds it (vanilla DOM, prepended to <body>). */
function ariaRegion() {
  const region = document.createElement('div');
  region.dataset.liveAnnouncer = 'true';
  const log = document.createElement('div');
  log.setAttribute('role', 'log');
  region.appendChild(log);
  document.body.prepend(region);
  return log;
}

function referenceNode(labelledBy: string) {
  const node = document.createElement('div');
  node.setAttribute('role', 'img');
  node.setAttribute('aria-labelledby', labelledBy);
  return node;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('React Aria reference announcements', () => {
  it('become plain text, so they still read correctly after the source disappears', async () => {
    const stop = resolveReferenceAnnouncements();
    const log = ariaRegion();
    const button = document.createElement('button');
    button.id = 'btn-activate';
    button.textContent = 'Activate demo tenant';
    document.body.appendChild(button);
    await flush();

    log.appendChild(referenceNode('btn-activate'));
    await flush();
    button.remove();

    const node = log.firstElementChild!;
    expect(node.getAttribute('role')).toBeNull();
    expect(node.getAttribute('aria-labelledby')).toBeNull();
    expect(node.textContent).toBe('Activate demo tenant');
    stop();
  });

  it('works when the region already exists, and ignores text announcements', async () => {
    const log = ariaRegion();
    const stop = resolveReferenceAnnouncements();
    const text = document.createElement('div');
    text.textContent = 'Saved';
    log.appendChild(text);
    log.appendChild(referenceNode('missing-id'));
    await flush();

    expect(log.children[0]!.textContent).toBe('Saved');
    expect(log.children[1]!.getAttribute('role')).toBeNull();
    expect(log.children[1]!.textContent).toBe('');
    stop();
  });
});
