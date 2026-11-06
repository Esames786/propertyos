import { screen } from '@testing-library/react';
import { Landmark } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { MetricCard } from './MetricCard';
import { StatTile } from './StatTile';

/** Text a screen reader can reach: the node and none of its ancestors hidden with aria-hidden. */
const exposed = (el: HTMLElement) => !el.closest('[aria-hidden="true"]');
/** Every occurrence of `part` in `text`. */
const count = (text: string, part: string) => text.split(part).length - 1;

describe('MetricCard (SH-02)', () => {
  it('without a link, reads the plain value (label, value, caption in order) while the visual value stays hidden', () => {
    renderWithProviders(<MetricCard testId="arr" label="Annual recurring revenue" value="Rs 7.5L" accessibleValue="Rs 754,080.00" caption="MRR × 12" icon={Landmark} hue="teal" />);
    const card = screen.getByTestId('arr');
    expect(card.tagName).toBe('DIV');
    const plain = screen.getByText('Rs 754,080.00');
    expect(exposed(plain)).toBe(true);
    expect(exposed(screen.getByText('Rs 7.5L'))).toBe(false);
    // Reading order of what is exposed: label, then the value, then the caption.
    const exposedText = [...card.querySelectorAll<HTMLElement>('span')].filter((s) => s.children.length === 0 && exposed(s) && s.textContent).map((s) => s.textContent);
    expect(exposedText).toEqual(['Annual recurring revenue', 'Rs 754,080.00', 'MRR × 12']);
  });

  it('without accessibleValue, the visible value is read as it is (nothing hidden, nothing added)', () => {
    renderWithProviders(<MetricCard testId="units" label="Units" value="42" caption="in 3 sites" icon={Landmark} hue="gold" />);
    expect(exposed(screen.getByText('42'))).toBe(true);
    expect(screen.getByTestId('units').querySelector('.sr-only')).toBeNull();
  });

  it('as a link, keeps its name (label, value, caption) and adds no second value', () => {
    renderWithProviders(<MetricCard label="Outstanding" value="Rs 1.2M" accessibleValue="Rs 1,200,000.00" caption="3 instalments left" icon={Landmark} hue="amber" href="/customer/portal/payments" />);
    const link = screen.getByRole('link', { name: 'Outstanding, Rs 1,200,000.00, 3 instalments left' });
    expect(link.querySelector('.sr-only')).toBeNull();
  });
});

describe('StatTile (SH-02)', () => {
  it('names the link by label, value, change and context, each once', () => {
    renderWithProviders(
      <StatTile
        label="Collected"
        value="Rs 1.22B"
        accessibleValue="Rs 1.22B"
        delta={{ text: '+10.7%', description: 'up 10.7% on the previous 6 months', direction: 'up', tone: 'positive' }}
        context="81% of Rs 1.5B scheduled"
        href="/backoffice/col/collections-dashboard"
      />,
    );
    const link = screen.getByRole('link', { name: 'Collected, Rs 1.22B, up 10.7% on the previous 6 months, 81% of Rs 1.5B scheduled' });
    expect(count(link.getAttribute('aria-label')!, '81% of Rs 1.5B scheduled')).toBe(1);
  });

  it('does not repeat a context the caller already put into the value (once, not twice)', () => {
    renderWithProviders(<StatTile label="Approved obligation" value="Rs 7.4L" accessibleValue="Rs 735,050.00" context="Rs 735,050.00" href="/a" />);
    expect(screen.getByRole('link', { name: 'Approved obligation, Rs 735,050.00' })).toBeInTheDocument();
    renderWithProviders(<StatTile label="Billed" value="Rs 2M" accessibleValue="Rs 2,000,000.00, 79 invoices" context="79 invoices" href="/b" />);
    const billed = screen.getByRole('link', { name: 'Billed, Rs 2,000,000.00, 79 invoices' });
    expect(count(billed.getAttribute('aria-label')!, '79 invoices')).toBe(1);
  });

  it('a context that is not plain text becomes the link’s description', () => {
    renderWithProviders(
      <StatTile
        label="Overdue"
        value="Rs 45K"
        accessibleValue="Rs 45,000.00"
        context={
          <span>
            3 accounts late · <b>Rs 120,000.00</b> owed in all
          </span>
        }
        href="/c"
      />,
    );
    const link = screen.getByRole('link', { name: 'Overdue, Rs 45,000.00' });
    expect(link).toHaveAccessibleDescription('3 accounts late · Rs 120,000.00 owed in all');
  });

  it('without a context the name is unchanged (label, value, change)', () => {
    renderWithProviders(<StatTile label="Staff in this run" value="14" accessibleValue="14" href="/d" />);
    expect(screen.getByRole('link', { name: 'Staff in this run, 14' })).not.toHaveAttribute('aria-describedby');
  });
});
