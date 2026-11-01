import { FLAT_ROOMS, REQUEST_CATEGORIES, REQUEST_URGENCIES, type OpsFile, type OpsFlatPeople, type RequestDetail, type RequestKind, type ResidentRequests } from '@repo/contracts';
import { Button, ErrorState, PageHeader, PlainTextArea, PlainTextField, SegmentedControl, SelectControl, useApiMutation, useApiQuery, useNavigation, useQueryParam, useSession, useT, useToast } from '@repo/ui';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { OPS } from '../../../nav.config';
import { FlatSelect, Loading, ProblemAlert } from '../kit';
import { MaintenanceTabs } from './MaintenancePages';
import { PhotoPicker, useOpsWords } from './okit';

/**
 * MNT-004: the office raises a request (a phone call, a walk-in, something the guard saw). A repair
 * names a flat (and, if a resident asked, which of the flat's people); a community issue names a shared
 * place. The server checks the flat, the person's link to it and every field; it opens Request 360.
 */
export default function NewRequestPage() {
  const { t } = useT();
  const w = useOpsWords();
  const toast = useToast();
  const { navigate } = useNavigation();
  const { allows } = useSession();
  const [flatParam] = useQueryParam('flat');
  // The flats and who lives in or owns each (names only): maintenance staff need no access to the site's records.
  const flats = useApiQuery<OpsFlatPeople>({ method: 'GET', path: '/ops/flats' });
  const siteId = flats.data?.siteId;
  const areas = useApiQuery<ResidentRequests['areas']>({ method: 'GET', path: '/ops/areas' }, { retry: false });
  const create = useApiMutation<RequestDetail>();
  const issues = allows({ module: 'maintenance', feature: 'maintenance.community_issues', permission: 'issues.view' });
  const [kind, setKind] = useState<RequestKind>('repair');
  const [flatId, setFlatId] = useState<string | null>(flatParam);
  const [room, setRoom] = useState('kitchen');
  const [areaId, setAreaId] = useState<string | null>(null);
  const [category, setCategory] = useState('plumbing');
  const [urgency, setUrgency] = useState('normal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [onBehalfOf, setOnBehalfOf] = useState<string | null>(null);
  const [files, setFiles] = useState<Array<Omit<OpsFile, 'id'>>>([]);
  const [error, setError] = useState<unknown>(null);
  const [key] = useState(() => `req-${Date.now().toString(36)}`);
  const people = (kind === 'repair' && flats.data?.flats.find((x) => x.id === flatId)?.people) || [];
  if (flats.isError) return <ErrorState error={flats.error} />;
  return (
    <div className="@container space-y-5" data-testid="new-request-page">
      <PageHeader title={t('operations:new.title')} description={t('operations:new.intro')} breadcrumbs={[{ label: t('operations:maintenance.title'), href: OPS.maintenance }, { label: t('operations:new.title') }]} />
      <MaintenanceTabs current="list" />
      {!siteId ? (
        <Loading lines={6} />
      ) : (
        <form
          className="max-w-2xl space-y-4 rounded-card border border-border/70 bg-panel p-5 shadow-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              const r = await create.mutateAsync({ method: 'POST', path: '/ops/requests', body: { kind, category, urgency, title, description, files, idempotencyKey: key, ...(kind === 'repair' ? { flatId, room, ...(onBehalfOf ? { onBehalfOf } : {}) } : { areaId }) } });
              toast.success(t('operations:new.created', { ref: r.request.ref }));
              navigate(OPS.request(r.request.id));
            } catch (err) {
              setError(err);
            }
          }}
        >
          {issues && <SegmentedControl label={t('operations:new.kind')} value={kind} onChange={setKind} options={[{ id: 'repair', label: t('operations:kind.repair') }, { id: 'community_issue', label: t('operations:kind.community_issue') }]} testId="new-kind" />}
          {kind === 'repair' ? (
            <>
              <FlatSelect siteId={siteId} options={flats.data?.flats} value={flatId} onChange={(id) => { setFlatId(id); setOnBehalfOf(null); }} label={t('operations:new.flat')} testId="new-flat" />
              {flatId && people.length > 0 && (
                <SelectControl label={t('operations:new.onBehalf')} value={onBehalfOf} onChange={(v) => setOnBehalfOf(v)} options={people.map((p) => ({ id: p.partyId, label: `${p.partyName} · ${t(`sites:roles.${p.role}`)}` }))} testId="new-behalf" />
              )}
              <SelectControl label={t('operations:new.room')} value={room} onChange={(v) => setRoom(v ?? 'kitchen')} options={FLAT_ROOMS.map((r) => ({ id: r, label: w.room(r) }))} testId="new-room" />
            </>
          ) : (
            <SelectControl label={t('operations:new.area')} value={areaId} onChange={(v) => setAreaId(v)} options={(areas.data ?? []).map((a) => ({ id: a.id, label: w.area(a) }))} testId="new-area" />
          )}
          <SelectControl label={t('operations:new.category')} value={category} onChange={(v) => setCategory(v ?? 'other')} options={REQUEST_CATEGORIES.map((c) => ({ id: c, label: w.category(c) }))} testId="new-category" />
          <SelectControl label={t('operations:new.urgency')} value={urgency} onChange={(v) => setUrgency(v ?? 'normal')} options={REQUEST_URGENCIES.map((u) => ({ id: u, label: w.urgency(u) }))} testId="new-urgency" />
          <PlainTextField label={t('operations:new.titleField')} value={title} onChange={setTitle} testId="new-title" />
          <PlainTextArea label={t('operations:new.description')} value={description} onChange={setDescription} testId="new-description" />
          <PhotoPicker label={t('operations:new.photos')} files={files} onChange={setFiles} testId="new-photos" />
          {error ? <ProblemAlert error={error} /> : null}
          <Button type="submit" variant="primary" icon={Send} isPending={create.isPending} isDisabled={title.trim().length < 5 || description.trim().length < 10 || (kind === 'repair' ? !flatId : !areaId)} data-testid="new-submit">
            {t('operations:new.submit')}
          </Button>
        </form>
      )}
    </div>
  );
}
