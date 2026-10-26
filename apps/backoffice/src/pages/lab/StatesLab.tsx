import { ApiError, type Project } from '@repo/contracts';
import {
  Button,
  EmptyState,
  ErrorState,
  ForbiddenState,
  NotFoundState,
  OfflineState,
  PageHeader,
  Panel,
  SkeletonBlock,
  useApiQuery,
  useSession,
  useT,
  useTransport,
} from '@repo/ui';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';

const SAMPLE_ERROR = new ApiError({
  status: 503,
  code: 'service_unavailable',
  messageKey: 'errors:network.unavailable',
  correlationId: 'demo-0a1b2',
  changed: false,
});

/** Every empty/loading/error state in one place, plus a live request that follows the simulated network. */
export default function StatesLab() {
  const { t } = useT();
  const { persona } = useSession();
  const { mockMode } = useTransport();
  const [loading, setLoading] = useState(false);
  const projects = useApiQuery<Project[]>({ method: 'GET', path: '/projects' });

  const reload = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
  };

  return (
    <>
      <PageHeader title={t('lab:states.title')} description={t('lab:states.intro')} breadcrumbs={[{ label: t('nav:pages.lab'), href: '/backoffice/lab' }, { label: t('nav:pages.labStates') }]} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title={t('lab:states.liveFetch')}
          description={`${t('lab:states.liveFetchIntro')} (${t('common:demo.mockNetwork')}: ${t(`common:demo.mockModes.${mockMode}`)})`}
          actions={
            <Button size="sm" variant="secondary" icon={RefreshCw} isPending={projects.isFetching} onPress={() => void projects.refetch()}>
              {t('common:actions.retry')}
            </Button>
          }
        >
          <div data-testid="live-fetch">
            {projects.isPending ? (
              <SkeletonBlock />
            ) : projects.isError ? (
              <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
            ) : (
              <div className="space-y-2">
                <p role="status" className="text-sm font-medium text-success">
                  {t('lab:states.projectsLoaded', { count: projects.data.length })}
                </p>
                <ul className="list-disc ps-5 text-sm text-text">
                  {projects.data.map((p) => (
                    <li key={p.id}>
                      {p.name} · {p.city}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>
        <Panel title={t('lab:states.loading')} actions={<Button size="sm" variant="secondary" onPress={reload}>{t('lab:states.reload')}</Button>}>
          {loading ? <SkeletonBlock lines={4} /> : <p className="text-sm text-text">{t('lab:home.cards.states')}</p>}
        </Panel>
        <Panel title={t('lab:states.empty')}>
          <EmptyState />
        </Panel>
        <Panel title={t('lab:states.error')}>
          <ErrorState error={SAMPLE_ERROR} />
        </Panel>
        <Panel title={t('lab:states.forbidden')}>
          <ForbiddenState role={t((persona?.roleKey ?? 'common:persona.manager') as 'common:persona.manager')} />
        </Panel>
        <Panel title={t('lab:states.offline')}>
          <OfflineState />
        </Panel>
        <Panel title={t('lab:states.notFound')}>
          <NotFoundState />
        </Panel>
      </div>
    </>
  );
}
