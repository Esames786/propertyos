import type { HelpKey, useT } from '@repo/ui';

type TranslateFn = ReturnType<typeof useT>['t'];

/** Route metadata read by the layout (document title, help topic). Inertia passes the same as page props later. */
export interface RouteHandle {
  title: (t: TranslateFn, data: unknown) => string;
  helpKey?: HelpKey;
}
