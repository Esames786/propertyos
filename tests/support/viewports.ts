/** Reference sizes from blueprint 01 §5 and 04. 200 % zoom = half the CSS viewport at DPR 2. */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  phone: { width: 390, height: 844 },
  reflow: { width: 320, height: 640 },
  zoom200: { width: 720, height: 450 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;
