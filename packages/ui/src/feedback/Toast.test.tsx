import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { useToast, useToastClearance } from './Toast';

/** An action bar 68 px tall at the bottom of a 768 px window, spanning the full width. */
function bar(el: HTMLElement) {
  el.getBoundingClientRect = () => ({ top: 700, bottom: 768, left: 0, right: 1024, width: 1024, height: 68, x: 0, y: 700, toJSON: () => ({}) });
}

function Harness({ withBar, burst }: { withBar: boolean; burst: Array<['success' | 'error', string]> }) {
  const toast = useToast();
  const clearance = useToastClearance();
  useEffect(() => {
    for (const [tone, text] of burst) toast[tone](text);
    // Once: a burst of results, as when several actions finish in quick succession.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return withBar ? (
    <footer
      ref={(el) => {
        if (el) bar(el);
        clearance(el);
      }}
    >
      <button type="button">Save</button>
    </footer>
  ) : null;
}

/** Toasts first, then a drawer's action bar opens and closes again. */
function Later() {
  const toast = useToast();
  const clearance = useToastClearance();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    toast.success('before one');
    toast.error('before two');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)}>
        toggle
      </button>
      {open && (
        <footer
          ref={(el) => {
            if (el) bar(el);
            clearance(el);
          }}
        >
          <button type="button" onClick={() => toast.success('inside')}>
            act
          </button>
        </footer>
      )}
    </>
  );
}

describe('Toasts (Issue #8: never over a drawer’s buttons)', () => {
  it('from before a drawer opened wait until it closes; one from inside it shows', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    renderWithProviders(<Later />);
    const region = await screen.findByTestId('toast-region');
    await waitFor(() => expect(region.querySelectorAll('[data-testid^="toast-"]')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    await waitFor(() => expect(region.querySelectorAll('[data-testid^="toast-"]')).toHaveLength(0));
    fireEvent.click(screen.getByRole('button', { name: 'act' }));
    await waitFor(() => expect(region).toHaveTextContent('inside'));
    expect(region).not.toHaveTextContent('before');
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    // Closed: the earlier ones are back (still current), with the new one.
    await waitFor(() => expect(region.querySelectorAll('[data-testid^="toast-"]')).toHaveLength(3));
    expect(region).toHaveTextContent('before two');
  });

  it('keep at most three, oldest first out, an error included', async () => {
    renderWithProviders(<Harness withBar={false} burst={[['success', 'one'], ['error', 'two'], ['success', 'three'], ['success', 'four'], ['error', 'five']]} />);
    const region = await screen.findByTestId('toast-region');
    await waitFor(() => expect(region.querySelectorAll('[data-testid^="toast-"]')).toHaveLength(3));
    expect(region).toHaveTextContent('three');
    expect(region).toHaveTextContent('five');
    expect(region).not.toHaveTextContent('one');
    expect(region).not.toHaveAttribute('data-lifted');
    // In React Aria's top layer: still read by screen readers, and dismissing never closes a drawer.
    expect(region).toHaveAttribute('data-react-aria-top-layer');
  });

  it('rise above a registered action bar and show only the latest two there', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    renderWithProviders(<Harness withBar burst={[['success', 'saved'], ['error', 'refused'], ['success', 'sent']]} />);
    const region = await screen.findByTestId('toast-region');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    await waitFor(() => expect(region).toHaveAttribute('data-lifted', 'true'));
    // 768 − 700 = 68 px of bar, plus an 8 px gap.
    expect(region.style.bottom).toBe('76px');
    expect(region.querySelectorAll('[data-testid^="toast-"]')).toHaveLength(2);
    expect(region).toHaveTextContent('refused');
    expect(region).toHaveTextContent('sent');
  });
});
