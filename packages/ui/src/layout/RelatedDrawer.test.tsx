import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { RelatedDrawer } from './RelatedDrawer';

describe('RelatedDrawer', () => {
  it('links what the person may open and lists the rest as plain text that says why', async () => {
    renderWithProviders(
      <RelatedDrawer
        isOpen
        onOpenChange={() => {}}
        recordName="Usman Tariq"
        groups={[
          { title: 'Customer', items: [{ id: 'p1', ref: 'CUS-10001', title: 'Usman Tariq', href: '/backoffice/cus/customer-360-workspace?record=p1' }] },
          { title: 'Invoices', items: [{ id: 'i1', ref: 'INV-0001', title: 'Instalment 16', href: '/backoffice/fin/invoice-workspace?record=i1' }] },
        ]}
      />,
    );
    const drawer = await screen.findByTestId('related-drawer');
    // The test role holds customer.view but not invoice.view.
    expect(within(drawer).getByRole('link', { name: /Usman Tariq/ })).toBeTruthy();
    expect(within(drawer).queryByRole('link', { name: /Instalment 16/ })).toBeNull();
    const locked = within(drawer).getByTestId('related-locked');
    expect(locked.getAttribute('data-reason')).toBe('permission_missing');
    expect(locked.textContent).toContain('Not available to your role');
  });
});
