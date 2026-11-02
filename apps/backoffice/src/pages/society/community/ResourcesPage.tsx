import { RESOURCE_CATEGORIES, type AudienceRole, type ChatAudience, type ResourceCategory, type ResourceOffice, type ResourcesOffice } from '@repo/contracts';
import { Badge, Button, ConfirmDialog, Drawer, dynamicT, EmptyState, ErrorState, InlineAlert, PageHeader, PlainTextArea, PlainTextField, SelectControl, useApiMutation, useApiQuery, useT, useToast } from '@repo/ui';
import { ApiError } from '@repo/contracts';
import { FileText, Plus, Undo2, Upload, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { WRAP } from '../finance/fkit';
import { When } from '../operations/okit';
import { AudiencePicker } from './ChatSettingsPage';

/**
 * DOC-001 document centre, the part Gate D.3 delivers: documents published to residents (bylaws,
 * forms, guides, minutes) for an audience chosen from verified links; residents see them under
 * Resources on their Community home. The full document centre (versions, expiry, templates) is Gate E.
 * Files are fictional: only the name, type and size are kept in this browser.
 */
const MAX = 10 * 1024 * 1024;

export default function ResourcesPage() {
  const { t } = useT();
  const q = useApiQuery<ResourcesOffice>({ method: 'GET', path: '/ops/community/resources' });
  const [publishing, setPublishing] = useState(false);
  return (
    <div className="@container space-y-5" data-testid="resources-office">
      <PageHeader
        title={t('community:resources.officeTitle')}
        description={t('community:resources.officeIntro')}
        actions={
          <Button variant="primary" icon={Plus} onPress={() => setPublishing(true)} className={WRAP} data-testid="resource-new">
            {t('community:resources.publish')}
          </Button>
        }
      />
      <InlineAlert tone="info">
        {t('community:resources.gateNote')}
      </InlineAlert>
      <h2 className="text-lg font-semibold text-text">{t('community:resources.publishedTab')}</h2>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={5} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title={t('community:resources.officeNone')} />
      ) : (
        <ul className="space-y-2" data-testid="resource-rows">
          {q.data.items.map((r) => (
            <ResourceRow key={r.id} r={r} />
          ))}
        </ul>
      )}
      {q.data && <Publish open={publishing} onClose={() => setPublishing(false)} blocks={q.data.blocks} />}
    </div>
  );
}

function ResourceRow({ r }: { r: ResourceOffice }) {
  const { t } = useT();
  const toast = useToast();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  const [withdrawing, setWithdrawing] = useState(false);
  const withdraw = useApiMutation<ResourceOffice>();
  return (
    <li className="grid gap-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card @3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] @3xl:items-center" data-testid="resource-row" data-state={r.state}>
      <div className="min-w-0">
        <p className="font-semibold break-words text-text">
          <bdi>{r.title}</bdi>
        </p>
        <p className="text-xs break-words text-muted">
          <bdi dir="ltr">{r.ref}</bdi> · {t(`community:resourceCategory.${r.category}`)} · <bdi dir="ltr">{r.file.name}</bdi> · {t('community:resources.size', { size: fmt.count(Math.max(1, Math.round(r.file.sizeBytes / 1024))) })}
        </p>
        <p className="text-xs text-muted">
          {r.state === 'withdrawn' && r.withdrawn ? (
            <>
              {t('community:resources.withdrawnBy', { name: r.withdrawn.byName })} <When at={r.withdrawn.at} style="date" />: <bdi>{r.withdrawn.reason}</bdi>
            </>
          ) : (
            <>
              {t('community:resources.publishedBy', { name: r.publishedByName })} <When at={r.publishedAt} style="date" />
            </>
          )}
        </p>
      </div>
      <p className="inline-flex items-center gap-1 text-xs text-muted">
        <Users aria-hidden className="size-3.5 shrink-0" />
        {t('community:office.customAudience', { place: r.audience.label || t('community:office.wholeSite'), roles: r.audience.roles.map((x) => t(`community:role.${x}`)).join(', ') })} · {t('community:resources.reach', { count: r.reach })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={r.state === 'published' ? 'success' : 'neutral'} icon={r.state === 'published' ? FileText : Undo2}>
          {t(`community:resources.state.${r.state}`)}
        </Badge>
        {r.state === 'published' && (
          <Button size="sm" variant="quiet" onPress={() => setWithdrawing(true)} data-testid="resource-withdraw">
            {t('community:resources.withdraw')}
          </Button>
        )}
      </div>
      <ConfirmDialog
        isOpen={withdrawing}
        onOpenChange={setWithdrawing}
        title={t('community:resources.withdrawTitle', { title: r.title })}
        effect={t('community:resources.withdrawEffect')}
        confirmLabel={t('community:resources.withdraw')}
        destructive
        reasonLabel={t('community:resources.withdrawReason')}
        onConfirm={async (reason) => {
          try {
            await withdraw.mutateAsync({ method: 'POST', path: `/ops/community/resources/${r.id}/withdraw`, body: { reason } });
            toast.success(t('community:resources.withdrawn'));
            setWithdrawing(false);
          } catch (e) {
            const fields = e instanceof ApiError ? Object.values(e.problem.errors ?? {}).flat() : [];
            toast.error(e instanceof ApiError ? (fields[0] ? dt(fields[0].code, fields[0].params) : dt(e.problem.messageKey)) : t('errors:network.unavailable'));
          }
        }}
      />
    </li>
  );
}

function Publish({ open, onClose, blocks }: { open: boolean; onClose: () => void; blocks: Array<{ id: string; code: string }> }) {
  const { t } = useT();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ResourceCategory | ''>('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<{ name: string; type: string; sizeBytes: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [audience, setAudience] = useState<ChatAudience>({ scope: 'site', ids: [], roles: ['owner', 'occupant', 'payer'] as AudienceRole[] });
  const [error, setError] = useState<unknown>(null);
  const publish = useApiMutation<ResourceOffice>();
  const close = () => {
    setTitle('');
    setCategory('');
    setDescription('');
    setFile(null);
    setFileError(null);
    setAudience({ scope: 'site', ids: [], roles: ['owner', 'occupant', 'payer'] });
    setError(null);
    onClose();
  };
  return (
    <Drawer
      isOpen={open}
      onOpenChange={(o) => !o && close()}
      title={t('community:resources.publish')}
      size="lg"
      testId="resource-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            isPending={publish.isPending}
            onPress={async () => {
              setError(null);
              try {
                const r = await publish.mutateAsync({ method: 'POST', path: '/ops/community/resources', body: { title, category, description, file, audience } });
                toast.success(t('community:resources.publishedToast', { count: r.reach }));
                close();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="resource-publish"
          >
            {t('community:resources.publishNow')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <PlainTextField label={t('community:resources.fieldTitle')} value={title} onChange={setTitle} testId="resource-title" />
        <SelectControl label={t('community:resources.category')} value={category || null} onChange={(v) => setCategory((v ?? '') as ResourceCategory)} options={RESOURCE_CATEGORIES.map((c) => ({ id: c, label: t(`community:resourceCategory.${c}`) }))} testId="resource-category" />
        <PlainTextArea label={t('community:resources.description')} optional value={description} onChange={setDescription} testId="resource-description" />
        <div className="space-y-2" data-testid="resource-file">
          <p className="text-sm font-medium text-text">{t('community:resources.file')}</p>
          <input
            ref={input}
            type="file"
            accept="application/pdf"
            className="sr-only"
            tabIndex={-1}
            aria-label={t('community:resources.file')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.type !== 'application/pdf') return setFileError(t('community:errors.fileType'));
              if (f.size > MAX) return setFileError(t('community:errors.fileSize', { max: '10' }));
              setFileError(null);
              setFile({ name: f.name, type: f.type, sizeBytes: f.size });
            }}
            data-testid="resource-file-input"
          />
          {file && (
            <p className="text-sm break-words text-text">
              <bdi dir="ltr">{file.name}</bdi>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Upload} onPress={() => input.current?.click()} data-testid="resource-choose">
              {t('community:resources.choose')}
            </Button>
            <Button variant="quiet" onPress={() => setFile({ name: 'demo-document.pdf', type: 'application/pdf', sizeBytes: 120_000 })} data-testid="resource-sample">
              {t('community:resources.sample')}
            </Button>
          </div>
          <p className="text-xs text-muted">{t('community:resources.fileHint')}</p>
          {fileError && (
            <p role="alert" className="text-sm text-error">
              {fileError}
            </p>
          )}
        </div>
        <AudiencePicker value={audience} onChange={setAudience} blocks={blocks} testId="resource-audience" />
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}
