import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { ConfirmDialog } from './ConfirmDialog';

function Harness({ onConfirm, refusal }: { onConfirm: (reason?: string) => void; refusal?: string }) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <ConfirmDialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Release hold?"
        effect="The unit becomes available immediately."
        confirmLabel="Release hold"
        destructive
        reasonLabel="Reason"
        onConfirm={async (reason) => {
          onConfirm(reason);
          if (!refusal) return;
          setProblem(refusal);
          return false;
        }}
        problem={problem ? <p role="alert">{problem}</p> : undefined}
      />
    </>
  );
}

describe('ConfirmDialog', () => {
  it('states the effect, requires a reason, and returns focus on close', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(<Harness onConfirm={onConfirm} />);
    const opener = screen.getByRole('button', { name: 'open' });
    await user.click(opener);

    const dialog = await screen.findByRole('alertdialog', { name: 'Release hold?' });
    expect(dialog).toHaveTextContent('The unit becomes available immediately.');

    await user.click(screen.getByRole('button', { name: 'Release hold' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('This field is required.')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /reason/i }), 'Customer withdrew');
    await user.click(screen.getByRole('button', { name: 'Release hold' }));
    expect(onConfirm).toHaveBeenCalledWith('Customer withdrew');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness onConfirm={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'open' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('OPS-01: onConfirm resolving false keeps the dialog open with the typed reason and shows the refusal inside it', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(<Harness onConfirm={onConfirm} refusal="Write at least 10 characters." />);
    await user.click(screen.getByRole('button', { name: 'open' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Release hold?' });
    await user.type(screen.getByRole('textbox', { name: /reason/i }), 'Too short');
    await user.click(screen.getByRole('button', { name: 'Release hold' }));
    expect(onConfirm).toHaveBeenCalledWith('Too short');
    // Give a closing dialog every chance to close (onConfirm has resolved by now).
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.getByRole('alertdialog')).toBe(dialog);
    expect(screen.getByRole('textbox', { name: /reason/i })).toHaveValue('Too short');
    expect(screen.getByRole('alertdialog')).toContainElement(screen.getByRole('alert'));
    expect(screen.getByRole('alert')).toHaveTextContent('Write at least 10 characters.');
  });

  it('OPS-01: without a refusal nothing extra renders, and a void onConfirm still closes as before', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness onConfirm={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'open' }));
    await screen.findByRole('alertdialog');
    expect(screen.queryByRole('alert')).toBeNull();
    await user.type(screen.getByRole('textbox', { name: /reason/i }), 'Customer withdrew');
    await user.click(screen.getByRole('button', { name: 'Release hold' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
});
