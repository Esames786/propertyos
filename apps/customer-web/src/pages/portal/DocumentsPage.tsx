import type { PortalDocument, PortalDocumentKind, PortalDocuments } from '@repo/contracts';
import {
  Badge,
  Button,
  Drawer,
  ErrorState,
  IconTile,
  InlineAlert,
  PageHeader,
  RevealItem,
  Stagger,
  useApiQuery,
  useQueryParam,
  useSession,
  useT,
  type TileHue,
} from '@repo/ui';
import { Building2, CalendarCheck, ClipboardList, Eye, FileBadge, FileSignature, FileText, HardHat, KeyRound, Sparkles, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Amount, PortalSkeleton, usePortalFormat, type PortalFormat } from './shared';

const KIND: Record<PortalDocumentKind, [LucideIcon, TileHue]> = {
  allotment_letter: [FileBadge, 'emerald'],
  payment_plan: [CalendarCheck, 'sky'],
  booking_form: [FileSignature, 'violet'],
  account_statement: [ClipboardList, 'teal'],
  construction_report: [HardHat, 'amber'],
  possession_letter: [KeyRound, 'gold'],
};

/**
 * PORTAL-011 documents: the owner's fictional documents with a clearly labelled prototype preview
 * (deep-linkable with `?record=<document id>`). Nothing can be downloaded: these are not real papers.
 */
export default function DocumentsPage() {
  const { t } = useT();
  const query = useApiQuery<PortalDocuments>({ method: 'GET', path: '/portal/documents' });
  if (query.isPending) return <PortalSkeleton title={t('portal:documents.title')} />;
  if (query.isError)
    return (
      <>
        <PageHeader title={t('portal:documents.title')} />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  return <DocumentsView data={query.data} />;
}

function DocumentsView({ data }: { data: PortalDocuments }) {
  const { t } = useT();
  const fmt = usePortalFormat(data.asOf);
  const [record, setRecord] = useQueryParam('record');
  const open = data.documents.find((d) => d.id === record) ?? null;
  return (
    <div className="space-y-6" data-testid="portal-documents">
      <PageHeader title={t('portal:documents.title')} description={t('portal:documents.description', { unit: data.property.unitRef })} />
      <Stagger as="ul" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.documents.map((d) => {
          const [icon, hue] = KIND[d.kind];
          const name = t(`portal:documents.kind.${d.kind}`);
          return (
            <RevealItem as="li" key={d.id} className="flex">
              <article className="flex w-full flex-col rounded-card border border-border/70 bg-panel p-4 shadow-card transition-[translate,box-shadow] duration-[var(--motion-regular)] hover:-translate-y-0.5 hover:shadow-lift sm:p-5" data-testid={`document-${d.id}`}>
                <div className="flex items-start gap-3">
                  <IconTile icon={icon} hue={hue} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base leading-snug font-bold text-text">{name}</h2>
                    <p className="text-sm text-muted">{t(`portal:documents.hint.${d.kind}`)}</p>
                  </div>
                  {d.isNew && (
                    <Badge tone="info" icon={Sparkles}>
                      {t('portal:documents.new')}
                    </Badge>
                  )}
                </div>
                <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>{t('portal:documents.issued', { date: fmt.instant(d.issuedAt) })}</span>
                  <bdi dir="ltr" className="ltr-ref">
                    {d.ref}
                  </bdi>
                  <span>{t('portal:documents.meta', { pages: fmt.count(d.pages), size: fmt.count(d.sizeKb) })}</span>
                </p>
                <div className="mt-auto pt-4">
                  <Button variant="secondary" icon={Eye} onPress={() => setRecord(d.id, { replace: false })} className="w-full" aria-label={t('portal:documents.previewOf', { name })} data-testid={`preview-${d.id}`}>
                    {t('portal:documents.preview')}
                  </Button>
                </div>
              </article>
            </RevealItem>
          );
        })}
      </Stagger>
      <PreviewDrawer doc={open} data={data} fmt={fmt} onClose={() => setRecord(null)} />
    </div>
  );
}

function PreviewDrawer({ doc, data, fmt, onClose }: { doc: PortalDocument | null; data: PortalDocuments; fmt: PortalFormat; onClose: () => void }) {
  const { t } = useT();
  const { tenant } = useSession();
  const name = doc ? t(`portal:documents.kind.${doc.kind}`) : '';
  const { owner, property } = data;
  const rows: Array<[string, ReactNode]> = doc
    ? [
        [t('portal:documents.fields.reference'), <bdi dir="ltr" className="ltr-ref">{doc.ref}</bdi>],
        [t('portal:documents.fields.owner'), <bdi>{owner.displayName}</bdi>],
        [t('portal:documents.fields.customerRef'), <bdi dir="ltr" className="ltr-ref">{owner.customerRef}</bdi>],
        [t('portal:documents.fields.unit'), <bdi dir="ltr" className="ltr-ref">{property.unitRef}</bdi>],
        [t('portal:documents.fields.project'), <bdi>{property.projectName}</bdi>],
        [t('portal:documents.fields.type'), t('portal:home.typeArea', { type: t(`common:unitType.${property.type}`), area: fmt.area(property.areaSqft) })],
        [t('portal:documents.fields.price'), <Amount value={property.price.amount} />],
        [t('portal:documents.fields.issued'), fmt.instant(doc.issuedAt)],
      ]
    : [];
  return (
    <Drawer
      isOpen={!!doc}
      onOpenChange={(o) => !o && onClose()}
      title={t('portal:documents.previewOf', { name })}
      subtitle={doc ? <bdi dir="ltr" className="ltr-ref">{doc.ref}</bdi> : undefined}
      size="lg"
      testId="document-preview"
      banner={
        <div className="border-b border-border px-5 py-3">
          <InlineAlert tone="warning">{t('portal:documents.previewBanner')}</InlineAlert>
        </div>
      }
      footer={
        <Button variant="secondary" onPress={onClose}>
          {t('portal:documents.close')}
        </Button>
      }
    >
      {doc && (
        <div className="relative overflow-hidden rounded-tile border border-border bg-raised p-5 shadow-inset sm:p-8" data-testid="document-paper">
          <p
            aria-hidden
            className="pointer-events-none absolute inset-0 grid -rotate-[24deg] place-items-center text-center font-display text-[2.5rem] leading-none text-demo/15 uppercase select-none sm:text-[3.5rem]"
          >
            {t('portal:documents.watermark')}
          </p>
          <div className="relative">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <span aria-hidden className="grid size-11 place-items-center rounded-[12px] bg-primary font-display text-xl text-on-primary">
                {tenant.name.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="font-display text-lg leading-tight text-text">
                  <bdi>{tenant.name}</bdi>
                </p>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-muted">
                  <FileText aria-hidden className="size-4" />
                  {name}
                </p>
              </div>
              <Building2 aria-hidden className="ms-auto size-6 text-muted" />
            </div>
            <p className="mt-4 text-sm text-text">{t('portal:documents.previewIntro')}</p>
            <dl className="mt-4 divide-y divide-border rounded-control border border-border bg-panel/80">
              {rows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3.5 py-2.5 text-sm">
                  <dt className="text-muted">{label}</dt>
                  <dd className="min-w-0 text-end break-words text-text">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 rounded-control bg-demo-soft px-3 py-2 text-center text-xs font-medium text-demo">{t('portal:shell.demoFull')}</p>
          </div>
        </div>
      )}
    </Drawer>
  );
}
