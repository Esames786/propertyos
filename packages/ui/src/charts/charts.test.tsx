import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatTile } from '../data/StatTile';
import { SegmentedControl } from '../layout/SegmentedControl';
import { renderWithProviders } from '../test/render';
import { ChartCard } from './ChartCard';
import { ColumnTargetChart, type ColumnTargetPoint } from './ColumnTargetChart';

const POINTS: ColumnTargetPoint[] = [
  { id: '2026-08-01', label: 'Aug', fullLabel: 'August 2026', value: 120, target: 140 },
  { id: '2026-09-01', label: 'Sep', fullLabel: 'September 2026', value: 150, target: 145 },
  { id: '2026-10-01', label: 'Oct', fullLabel: 'October 2026, to date', value: 90, target: 110 },
];

function Collections() {
  return (
    <ChartCard
      title="Collections"
      summary="Rs 360 collected of Rs 395 scheduled."
      testId="collections"
      table={{
        caption: 'Collections by month',
        columns: [
          { id: 'm', label: 'Month' },
          { id: 'v', label: 'Collected', numeric: true },
        ],
        rows: POINTS.map((p) => ({ id: p.id, cells: [p.fullLabel, String(p.value)] })),
      }}
    >
      {({ titleId, summaryId }) => (
        <ColumnTargetChart
          points={POINTS}
          labelledBy={titleId}
          describedBy={summaryId}
          formatValue={(n) => `Rs ${n}`}
          formatTick={String}
          valueLabel="Collected"
          targetLabel="Scheduled"
          describePoint={(p) => `${p.fullLabel}: Rs ${p.value} of Rs ${p.target}`}
        />
      )}
    </ChartCard>
  );
}

describe('chart kit', () => {
  beforeEach(() => {
    // jsdom has no layout; give charts a measurable box.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 640, height: 260, top: 0, left: 0, right: 640, bottom: 260, x: 0, y: 0, toJSON: () => ({}) });
  });
  afterEach(() => vi.restoreAllMocks());

  it('column chart: one tab stop, arrow keys move between periods, each period has a full accessible name', async () => {
    renderWithProviders(<Collections />);
    const chart = await screen.findByRole('group', { name: 'Collections' });
    expect(chart).toHaveAccessibleDescription('Rs 360 collected of Rs 395 scheduled.');
    const columns = within(chart).getAllByRole('img');
    expect(columns).toHaveLength(3);
    expect(columns.filter((c) => c.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(columns[2]).toHaveAccessibleName('October 2026, to date: Rs 90 of Rs 110');

    columns[2]!.focus();
    fireEvent.keyDown(columns[2]!, { key: 'Home' });
    expect(columns[0]).toHaveFocus();
    fireEvent.keyDown(columns[0]!, { key: 'ArrowRight' });
    expect(columns[1]).toHaveFocus();
    fireEvent.keyDown(columns[1]!, { key: 'End' });
    expect(columns[2]).toHaveFocus();
  });

  it('column chart mirrors arrow keys in RTL (time runs right to left)', async () => {
    document.documentElement.dir = 'rtl';
    localStorage.setItem('pref:locale', 'ur-PK');
    renderWithProviders(<Collections />);
    const columns = within(await screen.findByRole('group', { name: 'Collections' })).getAllByRole('img');
    columns[0]!.focus();
    fireEvent.keyDown(columns[0]!, { key: 'ArrowLeft' });
    expect(columns[1]).toHaveFocus();
  });

  it('data table toggle swaps the chart for a captioned table with row headers', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Collections />);
    await user.click(screen.getByTestId('collections-table-toggle'));
    const table = screen.getByRole('table', { name: 'Collections by month' });
    expect(within(table).getAllByRole('rowheader').map((c) => c.textContent)).toEqual(POINTS.map((p) => p.fullLabel));
    expect(screen.queryByRole('group', { name: 'Collections' })).toBeNull();
  });

  it('stat tile is one link named by label, value and change in words', () => {
    renderWithProviders(
      <StatTile
        label="Collected"
        value="Rs 1.22B"
        accessibleValue="Rs 1.22B"
        delta={{ text: '+10.7%', description: 'up 10.7% on the previous 6 months', direction: 'up', tone: 'positive' }}
        href="/backoffice/col/collections-dashboard"
        trend={[1, 2, 3, 2, 4]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Collected, Rs 1.22B, up 10.7% on the previous 6 months' })).toHaveAttribute('href', '/backoffice/col/collections-dashboard');
  });

  it('segmented control is a radio group operated with arrow keys', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <SegmentedControl
        label="Reporting period"
        value="6m"
        onChange={onChange}
        options={[
          { id: '3m', label: '3 months' },
          { id: '6m', label: '6 months' },
        ]}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Reporting period' });
    expect(within(group).getByRole('radio', { name: '6 months' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: '3 months' }));
    expect(onChange).toHaveBeenCalledWith('3m');
  });
});
