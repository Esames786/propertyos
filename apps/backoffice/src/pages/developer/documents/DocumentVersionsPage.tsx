import { ApiError, type DocumentVersionView } from '@repo/contracts';
import { Badge, Button, ErrorState, Link, NotFoundState, PageHeader, Panel, SelectControl, useNavigation, useQueryParam, useQueryParams, useT } from '@repo/ui';
import { Equal, Eye, GitCompareArrows, Upload } from 'lucide-react';
import { Loading } from '../../society/kit';
import { LinkButton } from '../../society/hr/hkit';
import { HUB, HubNav, useHubFormat } from '../workspace/wkit';
import { ExpiryBadge, KindBadge, sizeText } from './dkit';
import { DocumentFinder, useDocument, VersionList } from './DocumentPreviewPage';
import { UploadDrawer } from './UploadDrawer';

/**
 * DOC-004 document versions: every version of a document the reader may see, newest first (versions
 * are immutable: an upload adds one, nothing is overwritten or deleted), with a side-by-side
 * comparison of any two versions and a direct new-version upload. Without `?record=` it lists the
 * reader's documents to pick from.
 */
export default function DocumentVersionsPage() {
  const [record] = useQueryParam('record');
  return record ? <VersionsWorkspace id={record} /> : <DocumentFinder target="versions" />;
}

type Row = { key: 'fileName' | 'size' | 'uploaded' | 'note' | 'expires' | 'checksum'; value: (v: DocumentVersionView) => string };

function VersionsWorkspace({ id }: { id: string }) {
  const { t } = useT();
  const f = useHubFormat();
  const set = useQueryParams();
  const { navigate } = useNavigation();
  const [a] = useQueryParam('a');
  const [b] = useQueryParam('b');
  const [drawer, setDrawer] = useQueryParam('drawer');
  const q = useDocument(id);
  if (q.isError) {
    return q.error instanceof ApiError && q.error.problem.status === 404 ? (
      <div className="space-y-4" data-testid="document-unavailable">
        <PageHeader title={t('documents:unavailable.title')} description={t('documents:unavailable.body')} />
        <NotFoundState actions={<Link href={HUB.versions()}>{t('documents:unavailable.back')}</Link>} />
      </div>
    ) : (
      <ErrorState error={q.error} onRetry={() => void q.refetch()} />
    );
  }
  const d = q.data;
  if (!d) return <Loading lines={8} />;
  const newest = d.versions[0]!;
  const left = d.versions.find((v) => String(v.n) === a) ?? d.versions[1] ?? newest;
  const right = d.versions.find((v) => String(v.n) === b) ?? newest;
  const rows: Row[] = [
    { key: 'fileName', value: (v) => v.fileName },
    { key: 'size', value: (v) => sizeText(v.sizeBytes) },
    { key: 'uploaded', value: (v) => `${f.when(v.uploadedAt)} · ${v.uploadedByName}` },
    { key: 'note', value: (v) => v.note || '—' },
    { key: 'expires', value: (v) => (v.expiresOn ? f.date(v.expiresOn) : t('documents:facts.noExpiry')) },
    { key: 'checksum', value: (v) => v.checksum },
  ];
  const options = d.versions.map((v) => ({ id: String(v.n), label: v.current ? t('documents:workspace.versionCurrent', { n: v.n }) : t('documents:version', { n: v.n }) }));

  return (
    <div className="@container space-y-5" data-testid="versions-workspace" data-doc={d.id}>
      <PageHeader
        title={t('documents:versions.title', { title: d.title })}
        breadcrumbs={[
          { label: t('documents:finder.title'), href: HUB.documents },
          { label: d.title, href: HUB.document(d.id) },
          { label: t('documents:versions.crumb') },
        ]}
        badge={
          <span className="flex flex-wrap items-center gap-2">
            <KindBadge kind={d.kind} />
            <ExpiryBadge doc={d} />
          </span>
        }
        description={t('documents:versions.intro')}
        actions={
          <div className="flex flex-wrap gap-2">
            {d.canUpload && (
              <Button className="max-w-full whitespace-normal text-center" variant="primary" icon={Upload} onPress={() => setDrawer('version')} data-testid="versions-new">
                {t('documents:actions.newVersion')}
              </Button>
            )}
            <LinkButton href={HUB.document(d.id)} icon={Eye} variant="secondary">
              {t('documents:actions.preview')}
            </LinkButton>
          </div>
        }
      />
      <HubNav current="documents" />
      {d.versions.length > 1 && (
        <Panel title={t('documents:versions.compare')} actions={<GitCompareArrows aria-hidden className="size-5 text-muted" />}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-xs">
              <SelectControl label={t('documents:versions.left')} value={String(left.n)} onChange={(v) => set({ a: v })} options={options} testId="compare-a" />
            </div>
            <div className="w-full max-w-xs">
              <SelectControl label={t('documents:versions.right')} value={String(right.n)} onChange={(v) => set({ b: v })} options={options} testId="compare-b" />
            </div>
          </div>
          <dl className="mt-4 divide-y divide-border" data-testid="compare-table">
            {rows.map((r) => {
              const same = r.value(left) === r.value(right);
              return (
                <div key={r.key} className="grid grid-cols-1 gap-1 py-2 text-sm @lg:grid-cols-[10rem_1fr_1fr_auto] @lg:gap-3" data-testid="compare-row" data-key={r.key} data-same={same}>
                  <dt className="font-medium text-muted">{t(`documents:versions.rows.${r.key}`)}</dt>
                  <dd className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="me-1 text-xs text-muted @lg:hidden">{t('documents:version', { n: left.n })}:</span>
                    <bdi dir={r.key === 'fileName' || r.key === 'checksum' ? 'ltr' : undefined}>{r.value(left)}</bdi>
                  </dd>
                  <dd className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="me-1 text-xs text-muted @lg:hidden">{t('documents:version', { n: right.n })}:</span>
                    <bdi dir={r.key === 'fileName' || r.key === 'checksum' ? 'ltr' : undefined}>{r.value(right)}</bdi>
                  </dd>
                  <dd>
                    {same ? (
                      <Badge tone="neutral" icon={Equal}>
                        {t('documents:versions.same')}
                      </Badge>
                    ) : (
                      <Badge tone="info" icon={GitCompareArrows}>
                        {t('documents:versions.changed')}
                      </Badge>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Panel>
      )}
      <Panel title={t('documents:versions.all', { count: d.versions.length })}>
        <VersionList detail={d} onPreview={(n) => navigate(HUB.document(d.id, `&version=${n}`))} />
      </Panel>
      {drawer === 'version' && d.canUpload && <UploadDrawer isOpen onOpenChange={(open) => !open && setDrawer(null)} mode={{ kind: 'version', doc: d }} onDone={() => set({ drawer: null, a: null, b: null })} />}
    </div>
  );
}
