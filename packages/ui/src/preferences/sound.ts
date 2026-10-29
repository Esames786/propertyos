/**
 * Optional, quiet feedback tones synthesised with Web Audio (no audio files), and an optional short
 * vibration on phones. Only used when the person turned them on; every tone or vibration accompanies
 * a visible message.
 */
let ctx: AudioContext | null = null;

export type Tone = 'success' | 'error';

const SHAPES: Record<Tone, Array<[frequency: number, durationMs: number]>> = {
  success: [
    [880, 70],
    [1320, 90],
  ],
  error: [
    [330, 120],
    [262, 160],
  ],
};

/** Peak gain for each volume setting (Gate D.1: quiet or normal). */
const GAIN = { quiet: 0.02, normal: 0.05 } as const;

export function playTone(tone: Tone, volume: keyof typeof GAIN = 'normal'): void {
  try {
    const AudioCtor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    ctx ??= new AudioCtor();
    let at = ctx.currentTime;
    for (const [frequency, duration] of SHAPES[tone]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(GAIN[volume], at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + duration / 1000 + 0.02);
      at += duration / 1000;
    }
  } catch {
    /* audio unavailable: visible feedback is always present */
  }
}

/** Whether this device can vibrate (phones; never desktops). */
export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function vibrate(tone: Tone): void {
  try {
    if (canVibrate()) navigator.vibrate(tone === 'success' ? 30 : [40, 60, 40]);
  } catch {
    /* not supported: visible feedback is always present */
  }
}
