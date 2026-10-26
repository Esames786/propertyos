import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { UrlTabs } from './Tabs';

const items = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, label: `Tab ${i}` }));

describe('UrlTabs', () => {
  it('shows a row plus More on desktop instead of 10 tiny tabs', () => {
    renderWithProviders(<UrlTabs label="Record" items={items}>{(id) => <p>panel {id}</p>}</UrlTabs>);
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(screen.getByRole('button', { name: /more/i })).toBeInTheDocument();
    expect(screen.getByText('panel t0')).toBeInTheDocument();
  });

  it('deep-links the selected tab in the URL and supports arrow keys', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UrlTabs label="Record" items={items}>{(id) => <p>panel {id}</p>}</UrlTabs>);
    await user.click(screen.getByRole('tab', { name: 'Tab 2' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/test?tab=t2');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Tab 3' })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens an overflow tab from the URL and swaps it into the visible row', () => {
    renderWithProviders(<UrlTabs label="Record" items={items}>{(id) => <p>panel {id}</p>}</UrlTabs>, { url: '/test?tab=t9' });
    expect(screen.getByRole('tab', { name: 'Tab 9' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('panel t9')).toBeInTheDocument();
  });
});
