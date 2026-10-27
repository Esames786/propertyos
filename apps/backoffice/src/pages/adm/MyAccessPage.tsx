import type { MyAccess } from '@repo/contracts';
import { Badge, dynamicT, ErrorState, Link, PageHeader, Panel, Skeleton, useApiQuery, useSession, useT } from '@repo/ui';
import { CheckCircle2, Eye, MapPin, UserRound } from 'lucide-react';
import { LINKS } from '../../nav.config';

/**
 * My access (owner decision, CP2 review): for every staff member, what they can use in their
 * organisation's workspace and on which sites, from the same effective access the server enforces.
 * It carries no plan, price or contract information; administrators also have "Your plan and
 * modules" for that.
 */
export default function MyAccessPage() {
  const { t } = useT();
  const { can } = useSession();
  const mine = useApiQuery<MyAccess>({ method: 'GET', path: '/workspace/my-access' });
  return (
    <div className="@container space-y-6" data-testid="my-access-page">
      <PageHeader
        title={t('nav:pages.myAccess')}
        badge={<Badge tone="neutral" icon={Eye}>{t('workspace:plan.readOnly')}</Badge>}
        description={mine.data ? t('workspace:myAccess.intro', { organisation: mine.data.organisation.name }) : undefined}
        actions={
          can('admin.view') ? (
            <Link href={LINKS.plan} data-testid="my-access-plan">
              {t('workspace:plan.open')}
            </Link>
          ) : undefined
        }
      />
      {mine.isPending ? <Skeleton className="h-96 rounded-card" /> : mine.isError ? <ErrorState error={mine.error} onRetry={() => void mine.refetch()} /> : <MyAccessBody mine={mine.data} />}
    </div>
  );
}

function MyAccessBody({ mine }: { mine: MyAccess }) {
  const { t } = useT();
  const tr = dynamicT(t);
  const scope = mine.scope.kind === 'all' ? t('workspace:myAccess.scopeAll') : mine.scope.kind === 'projects' ? t('workspace:myAccess.scopeProjects', { projects: mine.scope.names.join(', ') }) : t('workspace:myAccess.scopeOwn');
  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-start gap-4" data-testid="my-access-person">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-pill bg-primary-soft text-primary">
            <UserRound className="size-5" />
          </span>
          <dl className="grid min-w-0 flex-1 gap-3 @2xl:grid-cols-3">
            <div>
              <dt className="text-sm text-muted">{t('workspace:myAccess.person')}</dt>
              <dd className="font-semibold text-text">
                <bdi>{mine.person.displayName}</bdi>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t('workspace:myAccess.role')}</dt>
              <dd className="font-semibold text-text">{tr(mine.person.roleKey)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t('workspace:myAccess.scope')}</dt>
              <dd className="font-semibold text-text" data-testid="my-access-scope">
                {scope}
              </dd>
            </div>
          </dl>
        </div>
      </Panel>

      <Panel title={t('workspace:myAccess.areas', { count: mine.areas.length })} description={t('workspace:myAccess.areasHint')}>
        <ul className="grid gap-3 @2xl:grid-cols-2" data-testid="my-access-areas">
          {mine.areas.map((a) => (
            <li key={a.module} className="rounded-tile border border-border/70 p-4" data-testid={`my-access-area-${a.module}`}>
              <div className="flex items-start gap-3">
                <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
                <div className="min-w-0 space-y-1.5">
                  <p className="font-semibold text-text">{tr(`platform:modules.${a.module}.name`)}</p>
                  <p className="flex items-start gap-1.5 text-sm text-muted" data-testid="my-access-sites">
                    <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <span>{a.sites === 'all' ? t('workspace:myAccess.allSites') : t('workspace:myAccess.onlySites', { sites: a.sites.map((s) => s.name).join(', ') })}</span>
                  </p>
                  <ul className="flex flex-wrap gap-1.5" aria-label={t('workspace:myAccess.canDo')}>
                    {a.permissions.map((p) => (
                      <li key={p}>
                        <Badge tone="neutral">{tr(`workspace:permissions.${p}`)}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <p className="text-sm text-muted">{t('workspace:myAccess.askAdmin')}</p>
    </>
  );
}
