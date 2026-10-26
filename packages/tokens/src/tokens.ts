export { contrastRatio, luminance, parseHex } from './contrast';

/** WCAG thresholds used by the contrast test and the Tokens lab. */
export const CONTRAST = {
  text: 4.5,
  largeText: 3,
  nonText: 3,
} as const;

export type ContrastKind = keyof typeof CONTRAST;

/**
 * Every foreground/background combination the UI actually uses.
 * Adding a new combination in components means adding it here, so the test proves it.
 */
export const CONTRAST_PAIRS: ReadonlyArray<{
  fg: string;
  bg: string;
  kind: ContrastKind;
  usage: string;
}> = [
  { fg: 'text', bg: 'bg', kind: 'text', usage: 'Body text on page background' },
  { fg: 'text', bg: 'panel', kind: 'text', usage: 'Body text on cards and panels' },
  { fg: 'text', bg: 'sunken', kind: 'text', usage: 'Text in sunken wells and table headers' },
  { fg: 'muted', bg: 'bg', kind: 'text', usage: 'Secondary text on page background' },
  { fg: 'muted', bg: 'panel', kind: 'text', usage: 'Secondary text on panels' },
  { fg: 'muted', bg: 'sunken', kind: 'text', usage: 'Secondary text in sunken wells' },
  { fg: 'subtle', bg: 'panel', kind: 'text', usage: 'Hints and helper text' },
  { fg: 'subtle', bg: 'bg', kind: 'text', usage: 'Hints on page background' },
  { fg: 'border-control', bg: 'panel', kind: 'nonText', usage: 'Input, checkbox and select boundaries' },
  { fg: 'border-control', bg: 'bg', kind: 'nonText', usage: 'Control boundaries on page background' },
  { fg: 'primary', bg: 'panel', kind: 'text', usage: 'Links and primary text buttons' },
  { fg: 'primary', bg: 'primary-soft', kind: 'text', usage: 'Active navigation item' },
  { fg: 'on-primary', bg: 'primary', kind: 'text', usage: 'Primary button label' },
  { fg: 'on-primary', bg: 'primary-hover', kind: 'text', usage: 'Primary button label (hover)' },
  { fg: 'focus', bg: 'bg', kind: 'nonText', usage: 'Focus ring on page background' },
  { fg: 'focus', bg: 'panel', kind: 'nonText', usage: 'Focus ring on panels (offset gap)' },
  { fg: 'success', bg: 'success-soft', kind: 'text', usage: 'Success status label' },
  { fg: 'success', bg: 'panel', kind: 'text', usage: 'Success text on panels' },
  { fg: 'warning', bg: 'warning-soft', kind: 'text', usage: 'Warning status label' },
  { fg: 'warning', bg: 'panel', kind: 'text', usage: 'Warning text on panels' },
  { fg: 'error', bg: 'error-soft', kind: 'text', usage: 'Error status label and field errors' },
  { fg: 'error', bg: 'panel', kind: 'text', usage: 'Field error text' },
  { fg: 'info', bg: 'info-soft', kind: 'text', usage: 'Info status label' },
  { fg: 'demo', bg: 'demo-soft', kind: 'text', usage: 'DEMO / TRAINING badge' },
  { fg: 'demo', bg: 'panel', kind: 'text', usage: 'Training banner text' },
  { fg: 'inverse', bg: 'text', kind: 'text', usage: 'Tooltip and skip-link text' },
];

/** Decorative-only tokens: allowed below 3:1 because they never carry meaning or bound a control. */
export const DECORATIVE_TOKENS = ['border'] as const;
