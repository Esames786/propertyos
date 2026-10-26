import { findScreenByRegisterRoute } from '@repo/contracts/screens';
import { useLoaderData } from 'react-router';
import { NotFoundPage } from '../pages/system/NotFoundPage';
import { PlannedScreen } from '../pages/system/PlannedScreen';

/** Register URL → its planned page, or not-found. A register route is never a 404 (01 §16). */
export function registerLoader({ request }: { request: Request }) {
  const url = new URL(request.url);
  return { screen: findScreenByRegisterRoute(url.pathname) ?? null, record: url.searchParams.get('record') };
}

export type RegisterData = ReturnType<typeof registerLoader>;

export function RegisterResolver() {
  const data = useLoaderData() as RegisterData;
  return data.screen ? <PlannedScreen screen={data.screen} record={data.record} /> : <NotFoundPage />;
}
