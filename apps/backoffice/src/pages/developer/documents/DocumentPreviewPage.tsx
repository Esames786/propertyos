import { ApiError, DOC_KINDS, EXPIRY_STATES, type DocumentDetail, type DocumentPreview, type DocumentsList } from '@repo/contracts';
import { Badge, Button, EmptyState, ErrorState, FilterPills, InlineAlert, KeyValueList, Link, NotFoundState, PageHeader, Panel, PlainTextField, SelectControl, UrlTabs, useApiQuery, useNavigation, useQueryParam, useQueryParams, useT } from '@repo/ui';
import { CheckCircle2, Download, FilePlus2, History, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loading } from '../../society/kit';
import { LinkButton, unbroken } from '../../society/hr/hkit';
import { RelatedRecords } from '../workspace/RelatedRecords';
import { NOWRAP, FavouriteButton, HUB, HubNav, RecordLine, ShortcutsHelp, useFavourites, useHubFormat, useShortcuts, type Shortcut } from '../workspace/wkit';
import { DemoFileBadge, DocumentRow, downloadDemo, ExpiryBadge, KindBadge, sizeText } from './dkit';
import { UploadDrawer } from './UploadDrawer';

/**
 * DOC-002 document preview. With `?record=<document>`: the document workspace — preview (any
 * version), versions, related records, history — with record-specific actions (new version,
 * download, favourite). Without a record: the documents the reader may see, searchable and filtered
 * (kind, expiry, project, kind of linked record), with the upload drawer (DOC-003, `?drawer=upload`).
 */
export default function DocumentPreviewPage() {
  const [record] = useQueryParam('record');
  return record ? <DocumentWorkspace id={record} /> : <DocumentFinder target="preview" />;
}

// ---------------------------------------------------------------------------------------------
// The finder (search and filters)
// ---------------------------------------------------------------------------------------------
export function DocumentFinder({ target }: { target: 'preview' | 'versions' }) {
  const { t } = useT();
  const { navigate } = useNavigation();
  const set = useQueryParams();
  const [q] = useQueryParam('q');
  const [kind] = useQueryParam('kind');
  const [expiry] = useQueryParam('expiry');
  const [project] = useQueryParam('project');
  const [type] = useQueryParam('type');
  const [drawer, setDrawer] = useQueryParam('drawer');
  const [forId] = useQueryParam('for');
  const field = useRef<HTMLDivElement>(null);
  const query = { ...(q ? { q } : {}), ...(kind ? { kind } : {}), ...(expiry ? { expiry } : {}), ...(project ? { project } : {}), ...(type ? { type } : {}) };
  const list = useApiQuery<DocumentsList>({ method: 'GET', path: '/documents', query }, { placeholderData: (prev) => prev });
  const d = list.data;
  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { code: 'Slash', label: t('workspace:hub.shortcuts.focusFilter'), run: () => field.current?.querySelector('input')?.focus() },
      ...(d?.canUpload ? [{ code: 'KeyU' as const, label: t('documents:shortcuts.upload'), run: () => setDrawer('upload') }] : []),
    ],
    [t, d?.canUpload, setDrawer],
  );
  const keys = useShortcuts(shortcuts);
  const filtered = Object.keys(query).length > 0;
  return (
    <div className="@container space-y-5" data-testid={target === 'preview' ? 'documents-finder' : 'versions-finder'}>
      <PageHeader
        title={target === 'preview' ? t('documents:finder.title') : t('documents:versions.finderTitle')}
        description={target === 'preview' ? t('documents:finder.intro') : t('documents:versions.finderIntro')}
        actions={
          d?.canUpload ? (
            <Button className="max-w-full whitespace-normal text-center" variant="primary" icon={Upload} onPress={() => setDrawer('upload')} data-testid="documents-upload">
              {t('documents:finder.upload')}
            </Button>
          ) : undefined
        }
      />
      <HubNav current="documents" />
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !d ? (
        <Loading lines={8} />
      ) : (
        <>
          <FilterPills
            label={t('documents:finder.expiryLabel')}
            options={[{ id: 'all', label: t('documents:finder.allExpiry'), count: d.counts.all }, ...EXPIRY_STATES.map((s) => ({ id: s, label: t(`documents:expiry.${s}`), count: d.counts.expiry[s] }))]}
            value={expiry ?? 'all'}
            onChange={(v) => set({ expiry: v === 'all' ? null : v })}
            testId="documents-expiry"
          />
          <div className="flex flex-wrap items-end gap-3">
            <div ref={field} className="w-full max-w-sm">
              <PlainTextField label={t('documents:finder.search')} value={q ?? ''} onChange={(v) => set({ q: v.trim() ? v : null })} optional testId="documents-search" />
            </div>
            <div className="w-full max-w-xs">
              <SelectControl
                label={t('documents:finder.kind')}
                value={kind ?? 'all'}
                onChange={(v) => set({ kind: !v || v === 'all' ? null : v })}
                options={[{ id: 'all', label: t('documents:finder.allKinds') }, ...DOC_KINDS.filter((k) => d.counts.kinds[k] || k === kind).map((k) => ({ id: k, label: `${t(`documents:kinds.${k}`)} (${d.counts.kinds[k] ?? 0})` }))]}
                testId="documents-kind"
              />
            </div>
            <div className="w-full max-w-xs">
              <SelectControl
                label={t('documents:finder.linkedKind')}
                value={type ?? 'all'}
                onChange={(v) => set({ type: !v || v === 'all' ? null : v })}
                options={[{ id: 'all', label: t('documents:finder.allLinked') }, ...(['lead', 'party', 'unit', 'project'] as const).map((k) => ({ id: k, label: t(`workspace:hub.types.${k}`) }))]}
                testId="documents-type"
              />
            </div>
            {d.projects.length > 1 && (
              <div className="w-full max-w-xs">
                <SelectControl
                  label={t('documents:finder.project')}
                  value={project ?? 'all'}
                  onChange={(v) => set({ project: !v || v === 'all' ? null : v })}
                  options={[{ id: 'all', label: t('documents:finder.allProjects') }, ...d.projects.map((p) => ({ id: p.id, label: p.name }))]}
                  testId="documents-project"
                />
              </div>
            )}
          </div>
          <ShortcutsHelp shortcuts={shortcuts} on={keys.on} onChange={keys.set} />
          {d.items.length === 0 ? (
            <EmptyState
              title={t(filtered ? 'documents:finder.noneFiltered' : 'documents:finder.none')}
              body={t('documents:finder.noneBody')}
              actions={
                d.canUpload ? (
                  <Button className="max-w-full whitespace-normal text-center" variant="primary" icon={Upload} onPress={() => setDrawer('upload')}>
                    {t('documents:finder.upload')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-2" data-testid="documents-list">
              {d.items.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={target === 'versions' ? { ...doc, href: HUB.versions(doc.id) } : doc}
                  actions={
                    <LinkButton href={target === 'versions' ? doc.href : HUB.versions(doc.id)} size="sm" variant="quiet" icon={target === 'versions' ? FilePlus2 : History}>
                      {target === 'versions' ? t('documents:actions.preview') : t('documents:actions.versions', { count: doc.version })}
                    </LinkButton>
                  }
                />
              ))}
            </ul>
          )}
        </>
      )}
      {drawer === 'upload' && (
        <UploadDrawer
          isOpen
          onOpenChange={(open) => !open && set({ drawer: null, for: null })}
          mode={{ kind: 'new', forRecordId: forId }}
          onDone={(created) => navigate(created.href)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------------------------
function useBlobUrl(dataUrl: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!dataUrl) return setUrl(null);
    const [head, b64 = ''] = dataUrl.split(',');
    const bin = atob(b64);
    const blob = new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type: head?.slice(5).split(';')[0] ?? 'application/octet-stream' });
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [dataUrl]);
  return url;
}

export function PreviewPane({ detail }: { detail: DocumentDetail }) {
  const { t } = useT();
  const f = useHubFormat();
  const p: DocumentPreview = detail.preview;
  const v = detail.versions.find((x) => x.n === detail.previewVersion)!;
  const pdf = useBlobUrl(p.kind === 'pdf' ? p.dataUrl : undefined);
  return (
    <figure className="space-y-2" data-testid="document-preview" data-kind={p.kind} data-version={detail.previewVersion}>
      <div className="relative overflow-hidden rounded-tile border border-border bg-panel shadow-card">
        <p className="absolute end-2 top-2 z-10">
          <DemoFileBadge />
        </p>
        {p.kind === 'image' && p.dataUrl ? (
          <img src={p.dataUrl} alt={t('documents:preview.imageAlt', { title: detail.title, n: detail.previewVersion })} className="mx-auto max-h-[32rem] w-auto max-w-full object-contain p-4" />
        ) : p.kind === 'pdf' && pdf ? (
          <object data={pdf} type="application/pdf" aria-label={t('documents:preview.pdfLabel', { title: detail.title })} className="h-[32rem] w-full">
            <p className="p-4 text-sm text-muted">{t('documents:preview.pdfFallback')}</p>
          </object>
        ) : p.kind === 'text' ? (
          <pre className="max-h-[32rem] overflow-auto p-4 pt-10 text-sm whitespace-pre-wrap text-text [overflow-wrap:anywhere]" tabIndex={0} aria-label={t('documents:preview.textLabel', { title: detail.title })}>
            {p.text}
          </pre>
        ) : p.kind === 'page' && p.page ? (
          <article className="mx-auto max-w-2xl space-y-3 p-6 pt-12" aria-label={t('documents:preview.pageLabel', { title: detail.title })}>
            <h2 className="text-lg font-semibold text-text [overflow-wrap:anywhere]">
              <bdi>{unbroken(p.page.heading)}</bdi>
            </h2>
            <p className="rounded-control border border-demo/30 bg-demo-soft px-2 py-1 text-xs text-demo">{t('documents:preview.fictional')}</p>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm @md:grid-cols-[auto_1fr]">
              <dt className="text-muted">{t('documents:facts.reference')}</dt>
              <dd>
                <bdi dir="ltr" className={NOWRAP}>{unbroken(detail.ref)}</bdi> · {t('documents:version', { n: detail.previewVersion })}
              </dd>
              <dt className="text-muted">{t('documents:facts.linkedTo')}</dt>
              <dd className="[overflow-wrap:anywhere]">
                <bdi>{unbroken(detail.record.title)}</bdi>
              </dd>
              {p.page.lines.map((line, i) => (
                <div key={i} className="contents">
                  <dt className="text-muted">{i === 0 ? t('documents:facts.issuer') : t('documents:facts.note')}</dt>
                  <dd className="[overflow-wrap:anywhere]">
                    <bdi>{line}</bdi>
                  </dd>
                </div>
              ))}
              {v.expiresOn && (
                <>
                  <dt className="text-muted">{t('documents:facts.expires')}</dt>
                  <dd>{f.date(v.expiresOn)}</dd>
                </>
              )}
            </dl>
          </article>
        ) : (
          <p className="p-6 pt-12 text-sm text-muted">{t('documents:preview.none')}</p>
        )}
      </div>
      <figcaption className="text-xs text-muted">
        <bdi dir="ltr">{unbroken(v.fileName)}</bdi> · {sizeText(v.sizeBytes)} · {t('documents:updated', { when: f.when(v.uploadedAt), name: v.uploadedByName })}
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------------------------
// The document workspace
// ---------------------------------------------------------------------------------------------
function DocumentUnavailable() {
  const { t } = useT();
  return (
    <div className="space-y-4" data-testid="document-unavailable">
      <PageHeader title={t('documents:unavailable.title')} description={t('documents:unavailable.body')} />
      <NotFoundState actions={<Link href={HUB.documents}>{t('documents:unavailable.back')}</Link>} />
    </div>
  );
}

export function useDocument(id: string, version?: string | null) {
  return useApiQuery<DocumentDetail>({ method: 'GET', path: `/documents/${id}`, query: version ? { version } : {} }, { placeholderData: (prev) => (prev?.id === id ? prev : undefined), retry: (n, e) => !(e instanceof ApiError && e.problem.status === 404) && n < 2 });
}

function DocumentWorkspace({ id }: { id: string }) {
  const { t } = useT();
  const f = useHubFormat();
  const set = useQueryParams();
  const [version] = useQueryParam('version');
  const [drawer, setDrawer] = useQueryParam('drawer');
  const favourites = useFavourites();
  const q = useDocument(id, version);
  const d = q.data;
  const fav = useMemo(() => (d ? { id: d.id, title: d.title, favouritable: true } : null), [d]);
  const shortcuts = useMemo<Shortcut[]>(
    () =>
      d
        ? [
            ...(d.canUpload ? [{ code: 'KeyU' as const, label: t('documents:shortcuts.version'), run: () => setDrawer('version') }] : []),
            { code: 'KeyF' as const, label: t('documents:shortcuts.favourite'), run: () => void favourites.toggle(fav!) },
          ]
        : [],
    [d, t, setDrawer, favourites, fav],
  );
  const keys = useShortcuts(shortcuts);
  if (q.isError) return q.error instanceof ApiError && q.error.problem.status === 404 ? <DocumentUnavailable /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!d) return <Loading lines={10} />;
  const pageText = [d.title, d.ref, `${t('documents:version', { n: d.previewVersion })}`, d.record.title, t('documents:preview.fictional')].join('\n');

  return (
    <div className="@container space-y-5" data-testid="document-workspace" data-doc={d.id}>
      <PageHeader
        title={unbroken(d.title)}
        breadcrumbs={[
          { label: t('documents:finder.title'), href: HUB.documents },
          { label: unbroken(d.record.title), href: d.record.href },
          { label: d.ref },
        ]}
        badge={
          <span className="flex flex-wrap items-center gap-2">
            <KindBadge kind={d.kind} />
            <ExpiryBadge doc={d} />
          </span>
        }
        description={t('documents:workspace.intro')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {d.canUpload && (
              <Button className="max-w-full whitespace-normal text-center" variant="primary" icon={Upload} onPress={() => setDrawer('version')} data-testid="document-new-version">
                {t('documents:actions.newVersion')}
              </Button>
            )}
            <Button className="max-w-full whitespace-normal text-center" variant="secondary" icon={Download} onPress={() => downloadDemo(d, pageText)} data-testid="document-download">
              {t('documents:actions.download')}
            </Button>
            <LinkButton href={HUB.versions(d.id)} icon={History} variant="quiet" testId="document-versions-link">
              {t('documents:actions.versions', { count: d.versions.length })}
            </LinkButton>
            <FavouriteButton record={fav!} isFavourite={favourites.isFavourite(d.id)} onToggle={() => void favourites.toggle(fav!)} testId="document-favourite" />
          </div>
        }
      />
      {(d.expiry === 'expired' || d.expiry === 'expiring') && (
        <InlineAlert tone={d.expiry === 'expired' ? 'error' : 'warning'} title={d.expiry === 'expired' ? t('documents:workspace.expiredTitle') : t('documents:workspace.expiringTitle', { count: d.daysLeft ?? 0 })} data-testid="document-expiry-alert">
          <p>{t('documents:workspace.expiryBody', { date: f.date(d.expiresOn!) })}</p>
          {d.canUpload && (
            <Button className="mt-2 max-w-full whitespace-normal text-center" variant="secondary" size="sm" icon={Upload} onPress={() => setDrawer('version')} data-testid="document-renew">
              {t('documents:workspace.renew')}
            </Button>
          )}
        </InlineAlert>
      )}
      <ShortcutsHelp shortcuts={shortcuts} on={keys.on} onChange={keys.set} />
      <UrlTabs
        label={t('documents:workspace.tabs')}
        items={[
          { id: 'preview', label: t('documents:workspace.tab.preview') },
          { id: 'versions', label: t('documents:workspace.tab.versions', { count: d.versions.length }) },
          { id: 'related', label: t('documents:workspace.tab.related') },
          { id: 'history', label: t('documents:workspace.tab.history') },
        ]}
      >
        {(tab) =>
          tab === 'versions' ? (
            <VersionList detail={d} onPreview={(n) => set({ tab: null, version: String(n) })} />
          ) : tab === 'related' ? (
            <div className="space-y-5">
              <Panel title={t('documents:workspace.linkedRecord')}>
                <p className="text-sm">
                  <Link href={d.record.href} data-testid="document-linked-record">
                    <bdi>{unbroken(d.record.title)}</bdi>
                  </Link>
                </p>
                <RecordLine record={d.record} />
              </Panel>
              <RelatedRecords recordId={d.record.id} exclude={d.id} />
            </div>
          ) : tab === 'history' ? (
            <Panel title={t('documents:workspace.tab.history')}>
              <ol className="relative space-y-4 border-s border-border ps-6" data-testid="document-history">
                {d.history.map((e) => (
                  <li key={`${e.version}-${e.action}`} className="relative">
                    <span aria-hidden className="absolute -start-[2.05rem] top-0.5 grid size-6 place-items-center rounded-pill border border-border bg-panel text-muted">
                      <History className="size-3.5" />
                    </span>
                    <p className="text-sm text-text">
                      <bdi className="font-medium">{e.byName}</bdi> {t(e.action === 'uploaded' ? 'documents:events.uploaded' : 'documents:events.versionAdded', { version: e.version })}
                    </p>
                    {e.note && <p className="text-sm text-muted">“<bdi>{e.note}</bdi>”</p>}
                    <p className="text-xs text-muted">{f.when(e.at)}</p>
                  </li>
                ))}
              </ol>
            </Panel>
          ) : (
            <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                {d.versions.length > 1 && (
                  <div className="w-full max-w-xs">
                    <SelectControl
                      label={t('documents:workspace.showVersion')}
                      value={String(d.previewVersion)}
                      onChange={(v) => set({ version: v && Number(v) !== d.versions[0]!.n ? v : null })}
                      options={d.versions.map((v) => ({ id: String(v.n), label: v.current ? t('documents:workspace.versionCurrent', { n: v.n }) : t('documents:version', { n: v.n }) }))}
                      testId="document-version-select"
                    />
                  </div>
                )}
                <PreviewPane detail={d} />
              </div>
              <Panel title={t('documents:workspace.facts')}>
                <KeyValueList
                  items={[
                    { label: t('documents:facts.kind'), value: t(`documents:kinds.${d.kind}`) },
                    { label: t('documents:facts.reference'), value: <bdi dir="ltr" className={NOWRAP}>{unbroken(d.ref)}</bdi> },
                    {
                      label: t('documents:facts.linkedTo'),
                      value: (
                        <Link href={d.record.href}>
                          <bdi>{unbroken(d.record.title)}</bdi>
                        </Link>
                      ),
                    },
                    { label: t('documents:facts.currentVersion'), value: t('documents:version', { n: d.version }) },
                    { label: t('documents:facts.expires'), value: d.expiresOn ? f.date(d.expiresOn) : t('documents:facts.noExpiry') },
                    { label: t('documents:facts.updated'), value: `${f.when(d.updatedAt)} · ${d.updatedByName}` },
                  ]}
                />
                {d.siblings.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <h3 className="text-sm font-semibold text-text">{t('documents:workspace.siblings', { count: d.siblings.length })}</h3>
                    <ul className="space-y-1" data-testid="document-siblings">
                      {d.siblings.map((s) => (
                        <li key={s.id} className="text-sm [overflow-wrap:anywhere]">
                          <Link href={s.href}>
                            <bdi>{unbroken(s.title)}</bdi>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Panel>
            </div>
          )
        }
      </UrlTabs>
      {drawer === 'version' && d.canUpload && <UploadDrawer isOpen onOpenChange={(open) => !open && setDrawer(null)} mode={{ kind: 'version', doc: d }} onDone={() => set({ drawer: null, version: null })} />}
    </div>
  );
}

export function VersionList({ detail, onPreview }: { detail: DocumentDetail; onPreview: (n: number) => void }) {
  const { t } = useT();
  const f = useHubFormat();
  return (
    <ol className="space-y-2" data-testid="version-list">
      {detail.versions.map((v) => (
        <li key={v.n} className="rounded-tile border border-border/70 bg-panel p-3 shadow-card" data-testid="version-row" data-n={v.n} data-current={v.current}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
                {t('documents:version', { n: v.n })}
                {v.current && (
                  <Badge tone="success" icon={CheckCircle2}>
                    {t('documents:versions.current')}
                  </Badge>
                )}
              </p>
              <p className="text-xs text-muted [overflow-wrap:anywhere]">
                <bdi dir="ltr">{unbroken(v.fileName)}</bdi> · {sizeText(v.sizeBytes)} · {t('documents:updated', { when: f.when(v.uploadedAt), name: v.uploadedByName })}
              </p>
              {v.note && (
                <p className="text-sm text-text">
                  “<bdi>{v.note}</bdi>”
                </p>
              )}
              {v.expiresOn && <p className="text-xs text-muted">{t('documents:versions.expires', { date: f.date(v.expiresOn) })}</p>}
            </div>
            <Button className="max-w-full whitespace-normal text-center" variant="quiet" size="sm" onPress={() => onPreview(v.n)} data-testid="version-preview">
              {t('documents:versions.preview', { n: v.n })}
            </Button>
          </div>
        </li>
      ))}
    </ol>
  );
}
