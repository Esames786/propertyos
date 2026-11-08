import type { RelatedResponse } from '@repo/contracts';
import { dynamicT, EmptyState, ErrorState, Link, Panel, useApiQuery, useT } from '@repo/ui';
import { FilePlus2, FileText } from 'lucide-react';
import { Loading } from '../../society/kit';
import { LinkButton } from '../../society/hr/hkit';
import { HUB, RecordRow, useFavourites } from './wkit';

/**
 * Gate E.13 related-records panel: the record's related records (each resolved for the reader), its
 * documents (with `document.view`) and a direct upload when the reader may attach one. Built so any
 * record page can show it (`<RelatedRecords recordId=… />`); E.1/E.2/E.7 record pages adopt it at
 * integration.
 */
export function RelatedRecords({ recordId, exclude, headingLevel = 2 }: { recordId: string; exclude?: string; headingLevel?: 2 | 3 }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const favourites = useFavourites();
  const q = useApiQuery<RelatedResponse>({ method: 'GET', path: '/workspace/related', query: { record: recordId } });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={4} />;
  const d = q.data;
  const groups = d.groups.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== exclude) })).filter((g) => g.items.length);
  return (
    <div className="space-y-5" data-testid="related-records">
      {groups.length === 0 && !d.documents?.length ? <EmptyState title={t('workspace:hub.related.none')} body={t('workspace:hub.related.noneBody')} /> : null}
      {groups.map((g) => (
        <Panel key={`${g.relationKey}-${g.type}`} title={dt(g.relationKey)} headingLevel={headingLevel}>
          <ul className="space-y-2">
            {g.items.map((r) => (
              <RecordRow key={r.id} record={r} testId="related-row" favourite={{ isFavourite: favourites.isFavourite(r.id), onToggle: () => void favourites.toggle(r) }} />
            ))}
          </ul>
        </Panel>
      ))}
      {d.documents && (
        <Panel
          title={t('workspace:hub.related.documents', { count: d.documents.length })}
          headingLevel={headingLevel}
          actions={
            d.canAttach ? (
              <LinkButton href={HUB.upload(d.record.id)} size="sm" icon={FilePlus2} testId="related-upload">
                {t('workspace:hub.related.upload')}
              </LinkButton>
            ) : undefined
          }
        >
          {d.documents.length === 0 ? (
            <p className="text-sm text-muted">{t('workspace:hub.related.noDocuments')}</p>
          ) : (
            <ul className="space-y-1.5" data-testid="related-documents">
              {d.documents
                .filter((x) => x.id !== exclude)
                .map((x) => (
                  <li key={x.id} className="flex min-w-0 items-start gap-2 text-sm">
                    <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <Link href={x.href} data-testid="related-document">
                        <bdi>{x.title}</bdi>
                      </Link>{' '}
                      <span className="text-xs text-muted">
                        · <bdi dir="ltr">{x.ref}</bdi> · {t('workspace:hub.related.version', { n: x.version })} · {t(`documents:expiry.${x.expiry}` as 'documents:expiry.none')}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}

export { recordFromAddress, useRecordVisit } from './visit';
