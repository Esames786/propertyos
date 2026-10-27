import type { HelpKey, useT } from '@repo/ui';

type TranslateFn = ReturnType<typeof useT>['t'];

/** Route metadata read by the layout (document title, help topic). */
export interface RouteHandle {
  title: (t: TranslateFn, data: unknown) => string;
  helpKey?: HelpKey;
}
