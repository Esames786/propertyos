import { lazy } from 'react';
import { DevScreen, devRoute } from '../../../prototype/dev-screen';

/** E.3 INV-006 is a developer-only, unit.view-gated read-only prototype. */
const UnitPriceHistoryPage = lazy(() => import('./UnitPriceHistoryPage'));
export const routes = [
  devRoute(
    'inv/unit-price-history',
    <DevScreen page={UnitPriceHistoryPage} target={{ module: 'inventory', permission: 'unit.view' }} />,
    (t) => t('pricing:title'),
  ),
];
