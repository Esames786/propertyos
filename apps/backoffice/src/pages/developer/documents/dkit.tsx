import { DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES, type AttachTargets, type DocumentDetail, type DocumentSummary, type ExpiryState, type RecordRef } from '@repo/contracts';
import { AccessOutcomeView, Badge, cn, Link, Spinner, useApiQuery, useSession, useT, type StatusTone } from '@repo/ui';
import { CalendarCheck2, CalendarX2, Clock3, Search, type LucideIcon } from 'lucide-react';
import { Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from 'react';
import { ComboBox, Input, Label, ListBox, ListBoxItem, Popover } from 'react-aria-components';
import { unbroken } from '../../society/hr/hkit';
import { LINKS } from '../../../nav.config';
import { NOWRAP, RecordLine, TYPE_ICON, useHubFormat } from '../workspace/wkit';

/**
 * Gate E.13 documents kit: the route guard (`document.view`), expiry badges that never rely on colour
 * alone, the demo-file reader (type and size checked in the browser before the server checks them
 * again), the download of a demo file, and the searchable record picker for uploads.
 */

/** DOC-002…006 need `document.view`; anyone else gets the access outcome "not part of your role". */
export function DocumentsScreen({ page: Page }: { page: LazyExoticComponent<ComponentType> }) {
  const { can, tenant } = useSession();
  return can('document.view') ? (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  ) : (
    <AccessOutcomeView reason="permission_missing" module="core" organisation={tenant.name} startHref={LINKS.start} />
  );
}

const EXPIRY: Record<ExpiryState, [StatusTone, LucideIcon]> = {
  none: ['neutral', CalendarCheck2],
  valid: ['success', CalendarCheck2],
  expiring: ['warning', Clock3],
  expired: ['error', CalendarX2],
};

export function ExpiryBadge({ doc }: { doc: Pick<DocumentSummary, 'expiry' | 'daysLeft' | 'expiresOn'> }) {
  const { t } = useT();
  const f = useHubFormat();
  if (doc.expiry === 'none' || !doc.expiresOn) return null;
  const [tone, icon] = EXPIRY[doc.expiry];
  const text =
    doc.expiry === 'expired'
      ? t('documents:expiry.expiredAgo', { count: Math.abs(doc.daysLeft ?? 0), date: f.date(doc.expiresOn) })
      : doc.expiry === 'expiring'
        ? t('documents:expiry.expiresIn', { count: doc.daysLeft ?? 0, date: f.date(doc.expiresOn) })
        : t('documents:expiry.validUntil', { date: f.date(doc.expiresOn) });
  return (
    <Badge tone={tone} icon={icon} data-testid="expiry-badge" data-expiry={doc.expiry}>
      {text}
    </Badge>
  );
}

export function KindBadge({ kind }: { kind: string }) {
  const { t } = useT();
  return <Badge tone="neutral">{t(`documents:kinds.${kind}` as 'documents:kinds.other')}</Badge>;
}

export function DemoFileBadge() {
  const { t } = useT();
  return (
    <Badge tone="demo" data-testid="demo-file">
      {t('documents:demoFile')}
    </Badge>
  );
}

export const sizeText = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** The row of a document in a list: title, kind, version, linked record, expiry. */
export function DocumentRow({ doc, actions, testId = 'document-row' }: { doc: DocumentSummary; actions?: React.ReactNode; testId?: string }) {
  const { t } = useT();
  const f = useHubFormat();
  const LinkedIcon = TYPE_ICON[doc.record.type];
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-tile border border-border/70 bg-panel p-3 shadow-card @lg:flex-row @lg:items-start" data-testid={testId} data-doc={doc.id} data-expiry={doc.expiry}>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <Link href={doc.href} className="font-semibold [overflow-wrap:anywhere]" data-testid={`${testId}-link`}>
            <bdi>{doc.title}</bdi>
          </Link>
          <KindBadge kind={doc.kind} />
          <ExpiryBadge doc={doc} />
        </p>
        <p className="text-xs text-muted [overflow-wrap:anywhere]">
          <bdi dir="ltr" className={NOWRAP}>{unbroken(doc.ref)}</bdi> · {t('documents:version', { n: doc.version })} · <bdi dir="ltr">{doc.fileName}</bdi> · {sizeText(doc.sizeBytes)}
        </p>
        <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted">
          <LinkedIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0">
            {t('documents:linkedTo')}{' '}
            <Link href={doc.record.href}>
              <bdi>{doc.record.title}</bdi>
            </Link>
            <RecordLine record={doc.record} />
          </span>
        </p>
        <p className="text-xs text-muted">{t('documents:updated', { when: f.when(doc.updatedAt), name: doc.updatedByName })}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-1.5">{actions}</div>}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// Demo files
// ---------------------------------------------------------------------------------------------
const BY_EXTENSION: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain', csv: 'text/csv' };
export const ACCEPT = [...DOCUMENT_MIME_TYPES, '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.csv'];

export interface DemoFile {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  content: string;
}

/** The browser reads the chosen file; nothing leaves the browser. Type and size are checked here first. */
export async function readDemoFile(file: File): Promise<DemoFile | { problem: 'type' | 'size' | 'read' }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = (DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type) ? file.type : (BY_EXTENSION[ext] ?? file.type);
  if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)) return { problem: 'type' };
  if (file.size < 1 || file.size > DOCUMENT_MAX_BYTES) return { problem: 'size' };
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    // Some browsers label a file differently: the content's declared type follows the accepted type.
    const content = `data:${mimeType};base64,${raw.slice(raw.indexOf(',') + 1)}`;
    return { fileName: file.name, mimeType, sizeBytes: file.size, content };
  } catch {
    return { problem: 'read' };
  }
}

/** Saves the shown version's demo file (or the generated page as text) to the visitor's device. */
export function downloadDemo(detail: DocumentDetail, fallbackText: string) {
  const v = detail.versions.find((x) => x.n === detail.previewVersion);
  const name = v?.fileName ?? `${detail.ref}.txt`;
  let blob: Blob;
  let fileName = name;
  if (detail.preview.dataUrl) {
    const [head, b64 = ''] = detail.preview.dataUrl.split(',');
    const bin = atob(b64);
    blob = new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type: head?.slice(5).split(';')[0] ?? 'application/octet-stream' });
  } else if (detail.preview.kind === 'text') {
    blob = new Blob([detail.preview.text ?? ''], { type: 'text/plain' });
  } else {
    blob = new Blob([fallbackText], { type: 'text/plain' });
    fileName = `${name.replace(/\.[^.]+$/, '')}-demo.txt`;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------------------------
// Searchable record picker (records the reader may attach a document to; server-filtered)
// ---------------------------------------------------------------------------------------------
export function RecordPicker({ value, onChange, errorText, testId = 'record-picker' }: { value: RecordRef | null; onChange: (r: RecordRef | null) => void; errorText?: string; testId?: string }) {
  const { t } = useT();
  const [input, setInput] = useState(value?.title ?? '');
  const [debounced, setDebounced] = useState('');
  // A record chosen from outside (an address's ?for=) shows its name in the field.
  useEffect(() => {
    if (value) setInput(value.title);
  }, [value]);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(input.trim()), 250);
    return () => clearTimeout(id);
  }, [input]);
  const typed = value && input === value.title ? '' : debounced;
  const q = useApiQuery<AttachTargets>({ method: 'GET', path: '/documents/targets', query: typed.length >= 2 ? { q: typed } : {} }, { placeholderData: (prev) => prev });
  const items = q.data?.items ?? [];
  return (
    <ComboBox
      className="flex min-w-0 flex-col gap-1.5"
      items={items}
      inputValue={input}
      onInputChange={(v) => {
        setInput(v);
        if (value && v !== value.title) onChange(null);
      }}
      selectedKey={value?.id ?? null}
      onSelectionChange={(key) => {
        const r = items.find((x) => x.id === key) ?? null;
        if (r) {
          onChange(r);
          setInput(r.title);
        }
      }}
      isInvalid={!!errorText}
      menuTrigger="focus"
      allowsEmptyCollection
      data-testid={testId}
    >
      <Label className="text-sm font-medium text-text">{t('documents:upload.record')}</Label>
      <div className={cn('flex min-h-11 items-center gap-2 rounded-control border bg-panel px-3 focus-within:outline-2 focus-within:outline-focus', errorText ? 'border-error' : 'border-border-control')}>
        <Search aria-hidden className="size-4 shrink-0 text-muted" />
        <Input placeholder={t('documents:upload.recordPlaceholder')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle" data-testid={`${testId}-input`} />
        {q.isFetching && <Spinner className="text-muted" />}
      </div>
      <p className="text-xs text-muted">{t('documents:upload.recordHint')}</p>
      {errorText && <p className="text-xs font-medium text-error" data-testid={`${testId}-error`}>{errorText}</p>}
      <Popover placement="bottom start" offset={6} className="w-[--trigger-width] min-w-64 rounded-tile border border-border bg-panel p-1.5 shadow-overlay">
        <ListBox className="max-h-72 overflow-auto outline-none" renderEmptyState={() => <p className="px-3 py-2 text-sm text-muted">{t('documents:upload.recordNone')}</p>}>
          {(r: RecordRef) => (
            <ListBoxItem id={r.id} textValue={r.title} className="flex cursor-default flex-col rounded-control px-3 py-2 text-sm text-text outline-none data-focused:bg-primary-soft data-selected:font-semibold pointer-coarse:py-3" data-testid="record-option">
              <bdi className="font-medium">{r.title}</bdi>
              <RecordLine record={r} />
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}
