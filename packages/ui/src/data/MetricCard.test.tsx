import { formatMoney, formatMoneyCompact, type AppLocale } from '@repo/i18n';
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
    expect(link).not.toHaveAttribute('aria-describedby');
  });

  it('N-B2-5: as a link whose caption is markup (the resident "Paid to date" card), the caption is its description', () => {
    renderWithProviders(
      <MetricCard
        label="Paid to date"
        value="Rs 4.2M"
        accessibleValue="Rs 4,200,000.00"
        caption={
          <span>
            <span>34% of Rs 12.5M</span>
          </span>
        }
        icon={Landmark}
        hue="emerald"
        href="/customer/portal/payments?status=paid"
      />,
    );
    const link = screen.getByRole('link', { name: 'Paid to date, Rs 4,200,000.00' });
    expect(link).toHaveAccessibleDescription('34% of Rs 12.5M');
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

/**
 * Issue #20: S.3 Rentals (accepted at ae3b3a1) builds its LeasesPage tiles with a context that starts
 * with the same amount as the tile ("Rs 1,234,500.00 · a contract figure…"). The patterns below are
 * the exact ones in apps/backoffice/src/pages/rentals/LeasesPage.tsx, with its EN and UR hints.
 */
const S3: Record<AppLocale, Record<string, string>> = {
  'en-PK': {
    active: 'Active leases',
    rent: 'Monthly rent under management',
    rentHint: 'a contract figure, not money received',
    due: 'Rent due in November 2026',
    dueHint: 'previewed demand — not approved, not invoiced',
    payable: 'Owner payable (settled money only)',
    payableHint: 'nothing is settled: no bank evidence exists here',
    pending: 'Payout instructions pending',
    pendingHint: 'prepared or approved — none is sent or paid',
  },
  'ur-PK': {
    active: 'فعال لیز',
    rent: 'زیرِ انتظام ماہانہ کرایہ',
    rentHint: 'معاہدے کی رقم، وصول شدہ رقم نہیں',
    due: 'نومبر 2026 میں واجب کرایہ',
    dueHint: 'پیش منظر مطالبہ — نہ منظور، نہ انوائس',
    payable: 'مالکان کو واجب الادا (صرف طے شدہ رقم)',
    payableHint: 'کچھ طے نہیں: یہاں کوئی بینک ثبوت نہیں',
    pending: 'زیرِ التوا ادائیگی ہدایات',
    pendingHint: 'تیار یا منظور — کوئی بھیجی یا ادا نہیں ہوئی',
  },
};

describe('StatTile with the S.3 Rentals patterns (Issue #20): the amount is read once', () => {
  for (const locale of ['en-PK', 'ur-PK'] as AppLocale[]) {
    it(`${locale}: rent, due and payable tiles name the amount once and keep their hint; active and pending are unchanged`, () => {
      const w = S3[locale]!;
      const rent = { amount: '1234500.00', currency: 'PKR' };
      const due = { amount: '987650.00', currency: 'PKR' };
      const paid = { amount: '0.00', currency: 'PKR' };
      const [r, d, p] = [rent, due, paid].map((m) => formatMoney(m, locale)) as [string, string, string];
      renderWithProviders(
        <>
          <StatTile label={w.active!} value="12" accessibleValue="12" href="/a" testId="rent-kpi-active" />
          <StatTile label={w.rent!} value={formatMoneyCompact(rent, locale, 1)} accessibleValue={r} context={`${r} · ${w.rentHint}`} href="/b" testId="rent-kpi-rent" />
          <StatTile label={w.due!} value={formatMoneyCompact(due, locale, 1)} accessibleValue={d} context={`${d} · ${w.dueHint}`} href="/c" testId="rent-kpi-due" />
          <StatTile label={w.payable!} value={formatMoneyCompact(paid, locale, 1)} accessibleValue={`${p}. ${w.payableHint}`} context={`${p} · ${w.payableHint}`} href="/d" testId="rent-kpi-payable" />
          <StatTile label={w.pending!} value="3" accessibleValue="3" context={w.pendingHint} href="/e" testId="rent-kpi-pending" />
        </>,
      );
      const name = (id: string) => screen.getByTestId(id).getAttribute('aria-label')!;
      expect(name('rent-kpi-active')).toBe(`${w.active}, 12`);
      expect(name('rent-kpi-rent')).toBe(`${w.rent}, ${r}, ${w.rentHint}`);
      expect(name('rent-kpi-due')).toBe(`${w.due}, ${d}, ${w.dueHint}`);
      expect(name('rent-kpi-payable')).toBe(`${w.payable}, ${p}. ${w.payableHint}`);
      expect(name('rent-kpi-pending')).toBe(`${w.pending}, 3, ${w.pendingHint}`);
      for (const [id, amount, hint] of [['rent-kpi-rent', r, w.rentHint], ['rent-kpi-due', d, w.dueHint], ['rent-kpi-payable', p, w.payableHint]] as const) {
        expect(count(name(id), amount), `${id}: amount once`).toBe(1);
        expect(count(name(id), hint!), `${id}: hint once`).toBe(1);
      }
    });
  }

  it('a context that starts with the displayed (compact) value is read without it', () => {
    renderWithProviders(<StatTile label="Rent" value="Rs 1.2M" accessibleValue="Rs 1,234,500.00" context="Rs 1.2M · a contract figure" href="/f" />);
    expect(screen.getByRole('link', { name: 'Rent, Rs 1,234,500.00, a contract figure' })).toBeInTheDocument();
  });

  it('contexts that merely mention another figure, or share only a word, are not touched (every B2 tile)', () => {
    renderWithProviders(
      <>
        <StatTile label="Overdue" value="Rs 49.1K" accessibleValue="Rs 49,100.00" context="10 accounts late · Rs 392,300.00 owed in all" href="/g" testId="t1" />
        <StatTile label="Billed for November 2026" value="Not billed yet" accessibleValue="Not billed yet" context="No billing run yet" href="/h" testId="t2" />
        <StatTile label="Collected" value="Rs 1.22B" accessibleValue="Rs 1.22B" context="81% of Rs 1.5B scheduled" href="/i" testId="t3" />
        <StatTile label="Collected so far" value="Rs 12.6K" accessibleValue="Rs 12,600.00, 3 payments" context="4% of November 2026 settled" href="/j" testId="t4" />
        <StatTile label="Opening cash and bank" value="Rs 302.9K" accessibleValue="Rs 302,900.00" context="Cash Rs 17,500.00 · bank Rs 285,400.00" href="/k" testId="t5" />
        <StatTile label="Units" value="1,250" accessibleValue="1,250" context="1,250.5 m² in total" href="/l" testId="t6" />
      </>,
    );
    const name = (id: string) => screen.getByTestId(id).getAttribute('aria-label');
    expect(name('t1')).toBe('Overdue, Rs 49,100.00, 10 accounts late · Rs 392,300.00 owed in all');
    expect(name('t2')).toBe('Billed for November 2026, Not billed yet, No billing run yet');
    expect(name('t3')).toBe('Collected, Rs 1.22B, 81% of Rs 1.5B scheduled');
    expect(name('t4')).toBe('Collected so far, Rs 12,600.00, 3 payments, 4% of November 2026 settled');
    expect(name('t5')).toBe('Opening cash and bank, Rs 302,900.00, Cash Rs 17,500.00 · bank Rs 285,400.00');
    // "1,250" is the start of "1,250.5" but not a whole figure there: nothing is cut.
    expect(name('t6')).toBe('Units, 1,250, 1,250.5 m² in total');
  });
});
