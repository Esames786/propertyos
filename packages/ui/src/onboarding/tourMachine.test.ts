import { describe, expect, it } from 'vitest';
import { IDLE, tourReducer, type TourMachineState } from './tourMachine';
import type { TourStep } from './tourTypes';

const step = (id: string, extra: Partial<TourStep> = {}): TourStep => ({
  id,
  titleKey: `${id}.title`,
  bodyKey: `${id}.body`,
  kind: 'EXPLAIN',
  ...extra,
});

const steps = [
  step('welcome'),
  step('sidebar', { targetId: 'nav-primary' }),
  step('missing', { targetId: 'ghost', fallback: 'skip' }),
  step('search', { targetId: 'command-search', kind: 'GUIDED_ACTION', completionEvent: 'palette.closed', suspendEvent: 'palette.opened', resumeEvent: 'palette.cancelled' }),
  step('help', { targetId: 'global-help' }),
];

const start = (index = 0) => tourReducer(IDLE, { type: 'START', tourId: 'T', steps, index });
const running = (s: TourMachineState) => {
  if (s.status !== 'running') throw new Error(`expected running, got ${s.status}`);
  return s;
};

describe('tourReducer', () => {
  it('starts at the requested step and shows untargeted steps immediately', () => {
    expect(running(start()).phase).toBe('shown');
    expect(running(start(1)).phase).toBe('locating');
  });

  it('does not start a tour with no permitted steps', () => {
    expect(tourReducer(IDLE, { type: 'START', tourId: 'T', steps: [] })).toEqual(IDLE);
  });

  it('Next is index + 1 and finishing the last step completes', () => {
    let s = start(4);
    s = tourReducer(s, { type: 'TARGET_FOUND' });
    s = tourReducer(s, { type: 'NEXT' });
    expect(s).toEqual({ status: 'completed', tourId: 'T' });
  });

  it('Back stops at the first step', () => {
    expect(running(tourReducer(start(), { type: 'BACK' })).index).toBe(0);
  });

  it('skips a missing target forward with fallback "skip"', () => {
    let s = tourReducer(start(1), { type: 'NEXT' });
    expect(running(s).index).toBe(2);
    s = tourReducer(s, { type: 'TARGET_MISSING' });
    expect(running(s).index).toBe(3);
  });

  it('skips backwards when travelling back onto a missing target (no bounce)', () => {
    let s = tourReducer(start(3), { type: 'BACK' });
    s = tourReducer(s, { type: 'TARGET_MISSING' });
    expect(running(s).index).toBe(1);
  });

  it('explains without a highlight when fallback is "explain" (default)', () => {
    const s = tourReducer(start(1), { type: 'TARGET_MISSING' });
    expect(running(s).phase).toBe('fallback');
  });

  it('suspends, resumes and completes guided actions on events', () => {
    let s = running(tourReducer(start(3), { type: 'TARGET_FOUND' }));
    s = running(tourReducer(s, { type: 'EXTERNAL_EVENT', name: 'palette.opened' }));
    expect(s.suspended).toBe(true);
    s = running(tourReducer(s, { type: 'EXTERNAL_EVENT', name: 'palette.cancelled' }));
    expect(s.suspended).toBe(false);
    const done = running(tourReducer(s, { type: 'EXTERNAL_EVENT', name: 'palette.closed' }));
    expect(done.index).toBe(4);
  });

  it('ignores events meant for other steps', () => {
    const s = start(1);
    expect(tourReducer(s, { type: 'EXTERNAL_EVENT', name: 'palette.closed' })).toBe(s);
  });

  it('pause and skip end the run without completing', () => {
    expect(tourReducer(start(2), { type: 'PAUSE' })).toEqual(IDLE);
    expect(tourReducer(start(2), { type: 'SKIP' })).toEqual(IDLE);
  });
});
