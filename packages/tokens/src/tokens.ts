export { contrastRatio, luminance, parseHex } from './contrast';

/** WCAG thresholds used by the contrast test and the Tokens lab. */
export const CONTRAST = {
  text: 4.5,
  largeText: 3,
  nonText: 3,
} as const;

export type ContrastKind = keyof typeof CONTRAST;

/**
 * Tile hues (icon wayfinding and quick actions). Each hue has a solid fill, a soft square and an
 * ink for glyphs/labels on the soft square. Hues identify modules; they never encode status.
 */
export const TILE_HUES = ['emerald', 'teal', 'sky', 'violet', 'rose', 'amber', 'orange', 'slate', 'gold'] as const;
export type TileHue = (typeof TILE_HUES)[number];

/**
 * Every foreground/background combination the UI actually uses.
 * Adding a new combination in components means adding it here, so the test proves it
 * (standard, more-contrast and the authored night palette).
 */
export const CONTRAST_PAIRS: ReadonlyArray<{
  fg: string;
  bg: string;
  kind: ContrastKind;
  usage: string;
}> = [
  { fg: 'text', bg: 'bg', kind: 'text', usage: 'Body text on page background' },
  { fg: 'text', bg: 'panel', kind: 'text', usage: 'Body text on cards and panels' },
  { fg: 'text', bg: 'raised', kind: 'text', usage: 'Text on raised wells (rail, tiles)' },
  { fg: 'text', bg: 'sunken', kind: 'text', usage: 'Text in sunken wells and table headers' },
  { fg: 'muted', bg: 'bg', kind: 'text', usage: 'Secondary text on page background' },
  { fg: 'muted', bg: 'panel', kind: 'text', usage: 'Secondary text on panels' },
  { fg: 'muted', bg: 'raised', kind: 'text', usage: 'Secondary text on raised wells' },
  { fg: 'muted', bg: 'sunken', kind: 'text', usage: 'Secondary text in sunken wells' },
  { fg: 'subtle', bg: 'panel', kind: 'text', usage: 'Hints and helper text' },
  { fg: 'subtle', bg: 'bg', kind: 'text', usage: 'Hints on page background' },
  { fg: 'border-control', bg: 'panel', kind: 'nonText', usage: 'Input, checkbox and select boundaries' },
  { fg: 'border-control', bg: 'bg', kind: 'nonText', usage: 'Control boundaries on page background' },
  { fg: 'primary', bg: 'panel', kind: 'text', usage: 'Links and primary text buttons' },
  { fg: 'primary', bg: 'bg', kind: 'text', usage: 'Links on page background' },
  { fg: 'primary', bg: 'primary-soft', kind: 'text', usage: 'Active navigation item, selected segment' },
  { fg: 'on-primary', bg: 'primary', kind: 'text', usage: 'Primary button label' },
  { fg: 'on-primary', bg: 'primary-hover', kind: 'text', usage: 'Primary button label (hover)' },
  { fg: 'accent', bg: 'panel', kind: 'text', usage: 'Bronze eyebrow and accent text' },
  { fg: 'accent', bg: 'bg', kind: 'text', usage: 'Bronze eyebrow on page background' },
  { fg: 'accent', bg: 'accent-soft', kind: 'text', usage: 'Bronze chip label' },
  { fg: 'focus', bg: 'bg', kind: 'nonText', usage: 'Focus ring on page background' },
  { fg: 'focus', bg: 'panel', kind: 'nonText', usage: 'Focus ring on panels (offset gap)' },
  { fg: 'success', bg: 'success-soft', kind: 'text', usage: 'Success status label' },
  { fg: 'success', bg: 'panel', kind: 'text', usage: 'Success text and positive deltas on panels' },
  { fg: 'warning', bg: 'warning-soft', kind: 'text', usage: 'Warning status label' },
  { fg: 'warning', bg: 'panel', kind: 'text', usage: 'Warning text on panels' },
  { fg: 'error', bg: 'error-soft', kind: 'text', usage: 'Error status label and field errors' },
  { fg: 'error', bg: 'panel', kind: 'text', usage: 'Field error text, negative deltas' },
  { fg: 'info', bg: 'info-soft', kind: 'text', usage: 'Info status label' },
  { fg: 'demo', bg: 'demo-soft', kind: 'text', usage: 'DEMO / TRAINING badge' },
  { fg: 'demo', bg: 'panel', kind: 'text', usage: 'Training banner text' },
  { fg: 'inverse', bg: 'text', kind: 'text', usage: 'Tooltip and skip-link text' },
  { fg: 'data-1', bg: 'panel', kind: 'nonText', usage: 'Chart series 1 (evergreen) on card' },
  { fg: 'data-2', bg: 'panel', kind: 'nonText', usage: 'Chart series 2 (brass) on card' },
  { fg: 'data-3', bg: 'panel', kind: 'nonText', usage: 'Chart series 3 (slate) on card' },
  { fg: 'data-4', bg: 'panel', kind: 'nonText', usage: 'Chart series 4 (clay) on card' },
  { fg: 'data-5', bg: 'panel', kind: 'nonText', usage: 'Chart series 5 (plum) on card' },
  ...TILE_HUES.flatMap((hue) => [
    { fg: 'on-tile', bg: `tile-${hue}`, kind: 'nonText' as const, usage: `White glyph on the solid ${hue} quick-action tile` },
    { fg: `tile-${hue}-ink`, bg: `tile-${hue}-soft`, kind: 'text' as const, usage: `${hue} glyph and label on its soft icon square` },
    { fg: `tile-${hue}-ink`, bg: 'panel', kind: 'text' as const, usage: `${hue} accent text on a card` },
  ]),
];

/** Decorative-only tokens: allowed below 3:1 because they never carry meaning or bound a control. */
export const DECORATIVE_TOKENS = ['border', 'brass', 'chart-grid', 'chart-axis'] as const;

/**
 * Ordinal ramps (funnel stages, unit lifecycle). One hue, light → dark; the lightest step must
 * still clear 2:1 on the card so the first stage never vanishes (data-viz ordinal rule).
 */
export const ORDINAL_RAMPS = {
  evergreen: ['ever-1', 'ever-2', 'ever-3', 'ever-4'],
  bronze: ['bronze-1', 'bronze-2', 'bronze-3', 'bronze-4', 'bronze-5'],
} as const;

/**
 * Text on photography sits on a scrim of this colour. The scrim is the background of the text
 * block itself: it is never lighter than `textZoneMinAlpha` behind any text, then fades to clear
 * over `fade` above it. The token test composites the minimum over a pure-white pixel (the worst
 * case for any photo) and requires white text to keep 4.5:1. Chips on photos use `chipAlpha`.
 */
export const IMAGE_SCRIM = {
  rgb: [12, 17, 15] as const,
  textZoneMinAlpha: 0.62,
  edgeAlpha: 0.84,
  chipAlpha: 0.66,
  fade: '3.5rem',
} as const;

/** Background for a text block laid over a photo (pad its top by `IMAGE_SCRIM.fade`). */
export const imageScrimGradient = () => {
  const [r, g, b] = IMAGE_SCRIM.rgb;
  return `linear-gradient(to top, rgb(${r} ${g} ${b} / ${IMAGE_SCRIM.edgeAlpha}) 0%, rgb(${r} ${g} ${b} / ${IMAGE_SCRIM.textZoneMinAlpha}) calc(100% - ${IMAGE_SCRIM.fade}), rgb(${r} ${g} ${b} / 0) 100%)`;
};
