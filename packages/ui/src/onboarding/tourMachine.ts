import type { TourStep } from './tourTypes';

/**
 * Pure tour state machine (ADR-0002). No DOM access; the provider performs side effects.
 * "Next" always means index + 1 regardless of reading direction.
 */
export type TourPhase = 'locating' | 'shown' | 'fallback';

export type TourMachineState =
  | { status: 'idle' }
  | {
      status: 'running';
      tourId: string;
      steps: TourStep[];
      index: number;
      phase: TourPhase;
      direction: 1 | -1;
      suspended: boolean;
    }
  | { status: 'completed'; tourId: string };

export type TourEvent =
  | { type: 'START'; tourId: string; steps: TourStep[]; index?: number }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SKIP' }
  | { type: 'PAUSE' }
  | { type: 'DISMISS_COMPLETION' }
  | { type: 'TARGET_FOUND' }
  | { type: 'TARGET_MISSING' }
  | { type: 'RELOCATE' }
  | { type: 'EXTERNAL_EVENT'; name: string };

export const IDLE: TourMachineState = { status: 'idle' };

const phaseFor = (step: TourStep | undefined): TourPhase => (step?.targetId ? 'locating' : 'shown');

function goTo(
  state: Extract<TourMachineState, { status: 'running' }>,
  index: number,
  direction: 1 | -1,
): TourMachineState {
  if (index >= state.steps.length) return { status: 'completed', tourId: state.tourId };
  const clamped = Math.max(0, index);
  return { ...state, index: clamped, direction, phase: phaseFor(state.steps[clamped]), suspended: false };
}

export function tourReducer(state: TourMachineState, event: TourEvent): TourMachineState {
  if (event.type === 'START') {
    if (event.steps.length === 0) return IDLE;
    const index = Math.min(Math.max(event.index ?? 0, 0), event.steps.length - 1);
    return {
      status: 'running',
      tourId: event.tourId,
      steps: event.steps,
      index,
      phase: phaseFor(event.steps[index]),
      direction: 1,
      suspended: false,
    };
  }
  if (state.status === 'completed') return event.type === 'DISMISS_COMPLETION' ? IDLE : state;
  if (state.status !== 'running') return state;

  const step = state.steps[state.index];
  switch (event.type) {
    case 'NEXT':
      return goTo(state, state.index + 1, 1);
    case 'BACK':
      return state.index === 0 ? state : goTo(state, state.index - 1, -1);
    case 'SKIP':
    case 'PAUSE':
      return IDLE;
    case 'TARGET_FOUND':
      return state.phase === 'locating' ? { ...state, phase: 'shown' } : state;
    case 'TARGET_MISSING': {
      if (state.phase !== 'locating') return state;
      if ((step?.fallback ?? 'explain') === 'explain') return { ...state, phase: 'fallback' };
      // Skip in the direction of travel; stepping back onto a missing step must not bounce forward.
      const next = state.index + state.direction;
      if (next < 0) return goTo(state, state.index + 1, 1);
      return goTo(state, next, state.direction);
    }
    case 'RELOCATE':
      return step?.targetId ? { ...state, phase: 'locating' } : state;
    case 'EXTERNAL_EVENT': {
      if (!step) return state;
      if (event.name === step.completionEvent) return goTo(state, state.index + 1, 1);
      if (event.name === step.suspendEvent) return { ...state, suspended: true };
      if (event.name === step.resumeEvent) return { ...state, suspended: false, phase: phaseFor(step) };
      return state;
    }
    default:
      return state;
  }
}
