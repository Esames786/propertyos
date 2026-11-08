import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import type { RouteHandle } from '../../../prototype/handle';

/**
 * Gate E.13 local route module (provisional; mounted by one hook in prototype/routes.tsx until E.0's
 * edition-aware route modules land): the connected workspace for every signed-in office member.
 * Each screen's data is filtered by the server per record; the routes add no access of their own.
 */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });
const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => async () => ({ Component: (await load())[name] });
const h = (handle: RouteHandle) => handle;

export const WORKSPACE_ROUTES: RouteObject[] = [
  { path: 'global/unified-search-results', lazy: page(() => import('./UnifiedSearchPage')), handle: h({ title: (t) => t('workspace:hub.search.title') }) },
  { path: 'global/recent-records', lazy: named(() => import('./SavedListPages'), 'RecentRecordsPage'), handle: h({ title: (t) => t('workspace:hub.recent.title') }) },
  { path: 'global/favorites', lazy: named(() => import('./SavedListPages'), 'FavouritesPage'), handle: h({ title: (t) => t('workspace:hub.favourites.title') }) },
  { path: 'home/my-tasks', lazy: named(() => import('./TaskPages'), 'MyTasksPage'), handle: h({ title: (t) => t('workspace:hub.tasks.title') }) },
  { path: 'home/work-queue', lazy: named(() => import('./TaskPages'), 'WorkQueuePage'), handle: h({ title: (t) => t('workspace:hub.queue.title') }) },
  { path: 'home/recent-activity', lazy: page(() => import('./RecentActivityPage')), handle: h({ title: (t) => t('workspace:hub.activity.title') }) },
];
