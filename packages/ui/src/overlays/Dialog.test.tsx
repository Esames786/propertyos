import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { ConfirmDialog } from './ConfirmDialog';

function Harness({ onConfirm }: { onConfirm: (reason?: string) => void }) {
  const [open, setOpen] = useState(false);
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
        onConfirm={onConfirm}
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
});
