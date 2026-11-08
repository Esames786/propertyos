import { ApiError, type ProjectKind, type ProjectSetupList, type ProjectSetupRecord, type ProjectSetupStep, type SetupBasics, type SetupStructure } from '@repo/contracts';
import { Button, ConfirmDialog, dynamicT, EmptyState, ErrorState, IconButton, InlineAlert, KeyValueList, Link, NotFoundState, PageHeader, Panel, PlainTextField, SelectControl, Stepper, useAnnounce, useApiMutation, useApiQuery, useKeyedCreate, useNavigation, useQueryParam, useQueryParams, useT, useToast, type StepperStep } from '@repo/ui';
import { ArrowLeft, Check, FilePlus2, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Loading, ProblemAlert } from '../../society/kit';
import { LinkButton } from '../../society/hr/hkit';
import { AreaNav, PRJ, ProvisionalNote, StateBadge, unbroken, useInvFormat } from './pkit';

/**
 * PRJ-003 project setup (maker-checker). The projects and inventory officer prepares a new project in
 * four steps (basics, site and legal entity, structure, review), each saved as a draft and validated in
 * the browser and again on the server; then submits it. A projects director, never the person who
 * prepared it (checked by principal on the server), activates it or returns it with a reason. Activation
 * creates no units: unit creation is a later slice. Who may see a draft is decided by the server.
 */

type Errors = Record<string, string>;
const CODE = /^[A-Z0-9]{2,5}$/;
const CITY = /^[\p{L}][\p{L} .'-]{1,39}$/u;
const KINDS: readonly ProjectKind[] = ['towers', 'plots', 'commercial'];
const STEPS: readonly ProjectSetupStep[] = ['basics', 'site', 'structure', 'review'];

function checkBasics(b: SetupBasics): Errors {
  const e: Errors = {};
  if (b.name.trim().length < 3 || b.name.trim().length > 60) e.name = 'projects:problems.nameLength';
  if (!CODE.test(b.code.trim().toUpperCase())) e.code = 'projects:problems.codeFormat';
  if (!CITY.test(b.city.trim())) e.city = 'projects:problems.city';
  if (!KINDS.includes(b.kind)) e.kind = 'projects:problems.kind';
  return e;
}

const whole = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);

function checkStructure(kind: ProjectKind, s: { towers: Array<Record<string, string>>; phases: Array<Record<string, string>> }): Errors {
  const e: Errors = {};
  const seen = new Set<string>();
  if (kind === 'plots') {
    if (s.phases.length < 1 || s.phases.length > 6) e.phases = 'projects:problems.phaseCount';
    s.phases.forEach((p, i) => {
      const label = (p.label ?? '').trim();
      if (label.length < 1 || label.length > 20) e[`phases.${i}.label`] = 'projects:problems.phaseLabel';
      else if (seen.has(label.toLowerCase())) e[`phases.${i}.label`] = 'projects:problems.duplicateName';
      seen.add(label.toLowerCase());
      const n = whole(p.plots ?? '');
      if (!(n >= 1 && n <= 400)) e[`phases.${i}.plots`] = 'projects:problems.plotCount';
    });
  } else {
    if (s.towers.length < 1 || s.towers.length > 6) e.towers = 'projects:problems.towerCount';
    s.towers.forEach((tw, i) => {
      const name = (tw.name ?? '').trim();
      if (name.length < 1 || name.length > 12) e[`towers.${i}.name`] = 'projects:problems.towerName';
      else if (seen.has(name.toLowerCase())) e[`towers.${i}.name`] = 'projects:problems.duplicateName';
      seen.add(name.toLowerCase());
      const floors = whole(tw.floors ?? '');
      const per = whole(tw.unitsPerFloor ?? '');
      if (!(floors >= 1 && floors <= 60)) e[`towers.${i}.floors`] = 'projects:problems.floorCount';
      if (!(per >= 1 && per <= 20)) e[`towers.${i}.unitsPerFloor`] = 'projects:problems.unitsPerFloor';
    });
  }
  return e;
}

/** Field problems from the server, merged under the browser's own. */
function serverErrors(error: unknown): Errors {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(Object.entries(error.problem.errors ?? {}).map(([k, list]) => [k, list[0]!.code]));
}

export default function ProjectSetupPage() {
  const { t } = useT();
  const [record] = useQueryParam('record');
  const [isNew] = useQueryParam('new');
  const list = useApiQuery<ProjectSetupList>({ method: 'GET', path: '/projects/setup' }, { retry: false });
  const header = <PageHeader title={t('projects:setup.title')} description={t('projects:setup.intro')} breadcrumbs={[{ label: t('projects:list.title'), href: PRJ.list() }, { label: t('projects:setup.title') }]} />;
  if (list.isError) {
    if (list.error instanceof ApiError && list.error.problem.status === 403) {
      return (
        <div className="space-y-5" data-testid="project-setup" data-access="none">
          {header}
          <AreaNav current="setup" />
          <InlineAlert tone="info" title={t('projects:setup.noAccessTitle')} data-testid="setup-no-access">
            {t('projects:setup.noAccess')}
          </InlineAlert>
          <ProvisionalNote />
        </div>
      );
    }
    return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  }
  if (!list.data) return <Loading lines={8} />;
  if (record) return <SetupWorkspace id={record} list={list.data} />;
  if (isNew && list.data.canCreate) return <NewProject list={list.data} />;
  return (
    <div className="@container space-y-5" data-testid="project-setup">
      <PageHeader
        title={t('projects:setup.title')}
        description={t('projects:setup.intro')}
        breadcrumbs={[{ label: t('projects:list.title'), href: PRJ.list() }, { label: t('projects:setup.title') }]}
        actions={
          list.data.canCreate ? (
            <LinkButton variant="primary" icon={FilePlus2} href={PRJ.setup({ new: '1' })} testId="setup-new">
              {t('projects:setup.new')}
            </LinkButton>
          ) : undefined
        }
      />
      <AreaNav current="setup" />
      <SetupList list={list.data} />
      <ProvisionalNote />
    </div>
  );
}

function SetupList({ list }: { list: ProjectSetupList }) {
  const { t } = useT();
  const f = useInvFormat();
  if (list.items.length === 0) return <EmptyState title={t('projects:setup.empty')} body={t('projects:setup.emptyHint')} />;
  return (
    <Panel title={t('projects:setup.listTitle')}>
      <ul className="divide-y divide-border" data-testid="setup-list">
        {list.items.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-3" data-testid="setup-row" data-setup={r.id} data-state={r.state}>
            <div className="min-w-0 space-y-0.5">
              <p className="font-semibold">
                <Link href={PRJ.setup({ record: r.id })} data-testid="setup-open">
                  <bdi>{r.basics?.name ?? r.ref}</bdi>
                </Link>{' '}
                <span className="font-normal text-muted">
                  · <bdi dir="ltr">{unbroken(r.ref)}</bdi>
                </span>
              </p>
              <p className="text-sm text-muted">
                {t('projects:setup.maker', { name: r.makerName })} · {t('projects:setup.created', { date: f.date(r.createdAt) })} · {t('projects:setup.plannedUnits', { count: f.count(r.plannedUnits) })}
              </p>
            </div>
            <StateBadge state={r.state} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function BasicsFields({ value, onChange, errors }: { value: SetupBasics; onChange: (v: SetupBasics) => void; errors: Errors }) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
      <PlainTextField label={t('projects:setup.basics.name')} value={value.name} onChange={(name) => onChange({ ...value, name })} description={t('projects:setup.basics.nameHint')} errorKey={errors.name} testId="setup-name" />
      <PlainTextField label={t('projects:setup.basics.code')} value={value.code} onChange={(code) => onChange({ ...value, code: code.toUpperCase() })} description={t('projects:setup.basics.codeHint')} errorKey={errors.code} dir="ltr" testId="setup-code" />
      <PlainTextField label={t('projects:setup.basics.city')} value={value.city} onChange={(city) => onChange({ ...value, city })} errorKey={errors.city} testId="setup-city" />
      <SelectControl label={t('projects:setup.basics.kind')} value={value.kind} onChange={(k) => k && onChange({ ...value, kind: k as ProjectKind })} options={KINDS.map((k) => ({ id: k, label: t(`projects:kind.${k}`) }))} description={t('projects:setup.basics.kindHint')} errorKey={errors.kind} testId="setup-kind" />
    </div>
  );
}

function NewProject({ list }: { list: ProjectSetupList }) {
  const { t } = useT();
  const { navigate } = useNavigation();
  const toast = useToast();
  const announce = useAnnounce();
  const [basics, setBasics] = useState<SetupBasics>({ name: '', code: '', city: list.sites[0]?.city ?? '', kind: 'towers' });
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<unknown>(null);
  const create = useKeyedCreate<ProjectSetupRecord>('prj-setup');
  const save = async () => {
    const local = checkBasics(basics);
    setErrors(local);
    setProblem(null);
    if (Object.keys(local).length) return;
    try {
      const r = await create.send({ method: 'POST', path: '/projects', body: { basics: { ...basics, code: basics.code.trim().toUpperCase() } } });
      const msg = t('projects:setup.toast.created', { ref: r.ref });
      toast.success(msg);
      announce(msg);
      navigate(PRJ.setup({ record: r.id, step: 'site' }));
    } catch (e) {
      setProblem(e);
      setErrors(serverErrors(e));
    }
  };
  return (
    <div className="@container space-y-5" data-testid="project-setup" data-mode="new">
      <PageHeader title={t('projects:setup.new')} breadcrumbs={[{ label: t('projects:list.title'), href: PRJ.list() }, { label: t('projects:setup.title'), href: PRJ.setup() }, { label: t('projects:setup.new') }]} />
      <Stepper label={t('projects:setup.steps.label')} steps={STEPS.map((s, i) => ({ id: s, label: t(`projects:setup.steps.${s}`), state: i === 0 ? 'current' : 'upcoming' }))} testId="setup-stepper" />
      <Panel title={t('projects:setup.steps.basics')}>
        <div className="space-y-4">
          {problem ? <ProblemAlert error={problem} /> : null}
          <BasicsFields value={basics} onChange={setBasics} errors={errors} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={Check} onPress={() => void save()} isPending={create.isPending} data-testid="setup-save">
              {t('projects:setup.save')}
            </Button>
            <LinkButton variant="quiet" href={PRJ.setup()}>
              {t('projects:setup.back')}
            </LinkButton>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function SetupWorkspace({ id, list }: { id: string; list: ProjectSetupList }) {
  const { t } = useT();
  const [stepParam] = useQueryParam('step');
  const set = useQueryParams();
  const q = useApiQuery<ProjectSetupRecord>({ method: 'GET', path: `/projects/${id}/setup` }, { retry: false });
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.problem.status === 404) return <NotFoundState headingLevel={1} actions={<LinkButton href={PRJ.setup()}>{t('projects:setup.back')}</LinkButton>} />;
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  }
  if (!q.data) return <Loading lines={10} />;
  const r = q.data;
  const firstOpen = STEPS.find((s) => s !== 'review' && !r.completed.includes(s)) ?? 'review';
  const step: ProjectSetupStep = r.canEdit && (STEPS as readonly string[]).includes(stepParam ?? '') ? (stepParam as ProjectSetupStep) : r.canEdit ? firstOpen : 'review';
  const steps: StepperStep[] = STEPS.map((s) => ({
    id: s,
    label: t(`projects:setup.steps.${s}`),
    state: s === step ? 'current' : s === 'review' ? (r.state === 'active' ? 'done' : 'upcoming') : r.completed.includes(s) ? 'done' : 'upcoming',
  }));
  const goto = (s: ProjectSetupStep) => set({ step: s });
  return (
    <div className="@container space-y-5" data-testid="project-setup" data-mode="record" data-setup={r.id} data-state={r.state} data-step={step}>
      <PageHeader
        title={r.basics?.name ?? r.ref}
        badge={<StateBadge state={r.state} testId="setup-state" />}
        description={
          <span>
            <bdi dir="ltr">{unbroken(r.ref)}</bdi> · {t('projects:setup.maker', { name: r.makerName })}
          </span>
        }
        breadcrumbs={[{ label: t('projects:list.title'), href: PRJ.list() }, { label: t('projects:setup.title'), href: PRJ.setup() }, { label: r.ref }]}
      />
      <Stepper label={t('projects:setup.steps.label')} steps={steps} testId="setup-stepper" />
      {r.canEdit && (
        <nav aria-label={t('projects:setup.steps.label')}>
          <ul className="flex flex-wrap gap-1.5">
            {STEPS.map((s) => (
              <li key={s}>
                <Button size="sm" variant={s === step ? 'primary' : 'quiet'} onPress={() => goto(s)} aria-current={s === step ? 'step' : undefined} data-testid={`setup-goto-${s}`}>
                  {t(`projects:setup.steps.${s}`)}
                </Button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {r.returnReason && r.state === 'returned' && (
        <InlineAlert tone="warning" data-testid="setup-returned">
          {t('projects:setup.review.returnedBy', { name: r.decidedByName ?? '', reason: r.returnReason })}
        </InlineAlert>
      )}
      {step === 'basics' && r.canEdit ? (
        <BasicsStep r={r} onDone={() => goto('site')} />
      ) : step === 'site' && r.canEdit ? (
        <SiteStep r={r} list={list} onDone={() => goto('structure')} />
      ) : step === 'structure' && r.canEdit ? (
        <StructureStep r={r} onDone={() => goto('review')} />
      ) : (
        <Review r={r} list={list} />
      )}
      <History r={r} />
      <ProvisionalNote />
    </div>
  );
}

function useStepSave(r: ProjectSetupRecord, step: 'basics' | 'site' | 'structure') {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const save = useApiMutation<ProjectSetupRecord>();
  const [problem, setProblem] = useState<unknown>(null);
  const send = async (value: unknown, onDone: () => void) => {
    setProblem(null);
    try {
      await save.mutateAsync({ method: 'POST', path: `/projects/${r.id}/setup/${step}`, body: { value } });
      const msg = t('projects:setup.toast.saved', { step: t(`projects:setup.steps.${step}`) });
      toast.success(msg);
      announce(msg);
      onDone();
      return true;
    } catch (e) {
      setProblem(e);
      return false;
    }
  };
  return { send, problem, isPending: save.isPending };
}

function StepActions({ onSave, isPending }: { onSave: () => void; isPending: boolean }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" icon={Check} onPress={onSave} isPending={isPending} data-testid="setup-save">
        {t('projects:setup.save')}
      </Button>
    </div>
  );
}

function BasicsStep({ r, onDone }: { r: ProjectSetupRecord; onDone: () => void }) {
  const { t } = useT();
  const [basics, setBasics] = useState<SetupBasics>(r.basics ?? { name: '', code: '', city: '', kind: 'towers' });
  const [errors, setErrors] = useState<Errors>({});
  const s = useStepSave(r, 'basics');
  return (
    <Panel title={t('projects:setup.steps.basics')}>
      <div className="space-y-4" data-testid="setup-step-basics">
        {s.problem ? <ProblemAlert error={s.problem} /> : null}
        <BasicsFields value={basics} onChange={setBasics} errors={{ ...serverErrors(s.problem), ...errors }} />
        <StepActions
          isPending={s.isPending}
          onSave={() => {
            const local = checkBasics(basics);
            setErrors(local);
            if (!Object.keys(local).length) void s.send({ ...basics, code: basics.code.trim().toUpperCase() }, onDone);
          }}
        />
      </div>
    </Panel>
  );
}

function SiteStep({ r, list, onDone }: { r: ProjectSetupRecord; list: ProjectSetupList; onDone: () => void }) {
  const { t } = useT();
  const [siteId, setSiteId] = useState<string | null>(r.site?.siteId ?? null);
  const [error, setError] = useState<string | undefined>();
  const s = useStepSave(r, 'site');
  const site = list.sites.find((x) => x.id === siteId);
  return (
    <Panel title={t('projects:setup.steps.site')}>
      <div className="space-y-4" data-testid="setup-step-site">
        {s.problem ? <ProblemAlert error={s.problem} /> : null}
        {list.sites.length === 0 ? (
          <p className="text-sm text-muted">{t('projects:setup.site.noSites')}</p>
        ) : (
          <SelectControl label={t('projects:setup.site.site')} value={siteId} onChange={(v) => setSiteId(v)} options={list.sites.map((x) => ({ id: x.id, label: `${x.name} · ${x.city}` }))} description={t('projects:setup.site.siteHint')} errorKey={error ?? serverErrors(s.problem).siteId} testId="setup-site" />
        )}
        <div className="rounded-control bg-sunken p-3 text-sm" data-testid="setup-entity">
          <p className="font-medium text-text">{t('projects:setup.site.entity')}</p>
          <p className="text-text">{site ? <bdi>{site.legalEntityName}</bdi> : '—'}</p>
          <p className="text-xs text-muted">{t('projects:setup.site.entityHint')}</p>
        </div>
        <StepActions
          isPending={s.isPending}
          onSave={() => {
            if (!site) {
              setError('projects:problems.site');
              return;
            }
            setError(undefined);
            void s.send({ siteId: site.id, legalEntityId: site.legalEntityId }, onDone);
          }}
        />
      </div>
    </Panel>
  );
}

type Row = Record<string, string>;

function StructureStep({ r, onDone }: { r: ProjectSetupRecord; onDone: () => void }) {
  const { t } = useT();
  const f = useInvFormat();
  const kind = r.basics?.kind ?? 'towers';
  const plots = kind === 'plots';
  const [towers, setTowers] = useState<Row[]>(r.structure?.towers.length ? r.structure.towers.map((x) => ({ name: x.name, floors: String(x.floors), unitsPerFloor: String(x.unitsPerFloor) })) : [{ name: 'A', floors: '', unitsPerFloor: '' }]);
  const [phases, setPhases] = useState<Row[]>(r.structure?.phases.length ? r.structure.phases.map((x) => ({ label: x.label, plots: String(x.plots) })) : [{ label: 'Phase 1', plots: '' }]);
  const [errors, setErrors] = useState<Errors>({});
  const s = useStepSave(r, 'structure');
  const shown = { ...serverErrors(s.problem), ...errors };
  const rows = plots ? phases : towers;
  const setRows = plots ? setPhases : setTowers;
  const fields = plots ? (['label', 'plots'] as const) : (['name', 'floors', 'unitsPerFloor'] as const);
  const group = plots ? 'phases' : 'towers';
  const total = plots ? phases.reduce((n, p) => n + (whole(p.plots ?? '') || 0), 0) : towers.reduce((n, tw) => n + (whole(tw.floors ?? '') || 0) * (whole(tw.unitsPerFloor ?? '') || 0), 0);
  const label = (k: string) => t(`projects:setup.structure.${k === 'label' ? 'phaseLabel' : k === 'name' ? 'towerName' : (k as 'floors')}`);
  const save = () => {
    const local = checkStructure(kind, { towers, phases });
    setErrors(local);
    if (Object.keys(local).length) return;
    const value: SetupStructure = plots ? { towers: [], phases: phases.map((p) => ({ label: p.label!.trim(), plots: whole(p.plots!) })) } : { phases: [], towers: towers.map((x) => ({ name: x.name!.trim(), floors: whole(x.floors!), unitsPerFloor: whole(x.unitsPerFloor!) })) };
    void s.send(value, onDone);
  };
  return (
    <Panel title={t(plots ? 'projects:setup.structure.phasesTitle' : 'projects:setup.structure.towersTitle')}>
      <div className="space-y-4" data-testid="setup-step-structure" data-kind={kind}>
        {s.problem ? <ProblemAlert error={s.problem} /> : null}
        {shown[group] && <InlineAlert tone="error">{dynamicT(t)(shown[group]!)}</InlineAlert>}
        <ol className="space-y-3">
          {rows.map((row, i) => (
            <li key={i} className="grid grid-cols-1 items-end gap-3 rounded-control border border-border/70 p-3 @2xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]" data-testid="setup-structure-row">
              {fields.map((k) => (
                <PlainTextField
                  key={k}
                  label={`${label(k)} · ${t('projects:setup.structure.row', { n: String(i + 1) })}`}
                  value={row[k] ?? ''}
                  onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)))}
                  inputMode={k === 'name' || k === 'label' ? undefined : 'numeric'}
                  errorKey={shown[`${group}.${i}.${k}`]}
                  testId={`setup-${group}-${i}-${k}`}
                />
              ))}
              <IconButton label={row.name || row.label ? t('projects:setup.structure.remove', { name: row.name || row.label || '' }) : t('projects:setup.structure.removeUnnamed', { n: String(i + 1) })} icon={Trash2} onPress={() => setRows(rows.filter((_, j) => j !== i))} isDisabled={rows.length <= 1} />
            </li>
          ))}
        </ol>
        {rows.length < 6 && (
          <Button variant="secondary" icon={Plus} onPress={() => setRows([...rows, plots ? { label: `Phase ${rows.length + 1}`, plots: '' } : { name: String.fromCharCode(65 + rows.length), floors: '', unitsPerFloor: '' }])} data-testid="setup-add-row">
            {t(plots ? 'projects:setup.structure.addPhase' : 'projects:setup.structure.addTower')}
          </Button>
        )}
        <p className="text-sm text-text" role="status" data-testid="setup-planned-total" data-total={total}>
          {t('projects:setup.structure.total', { count: f.count(total) })}
        </p>
        <StepActions isPending={s.isPending} onSave={save} />
      </div>
    </Panel>
  );
}

function Review({ r, list }: { r: ProjectSetupRecord; list: ProjectSetupList }) {
  const { t } = useT();
  const f = useInvFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const act = useApiMutation<ProjectSetupRecord>();
  const [problem, setProblem] = useState<unknown>(null);
  const [confirm, setConfirm] = useState<'activate' | 'return' | null>(null);
  const site = list.sites.find((x) => x.id === r.site?.siteId);
  const submit = async () => {
    setProblem(null);
    try {
      await act.mutateAsync({ method: 'POST', path: `/projects/${r.id}/submit` });
      const msg = t('projects:setup.toast.submitted', { ref: r.ref });
      toast.success(msg);
      announce(msg);
    } catch (e) {
      setProblem(e);
    }
  };
  const decide = async (decision: 'activate' | 'return', reason?: string) => {
    setProblem(null);
    try {
      await act.mutateAsync({ method: 'POST', path: `/projects/${r.id}/${decision}`, body: decision === 'return' ? { reason: reason ?? '' } : {} });
      const msg = decision === 'activate' ? t('projects:setup.toast.activated', { name: r.basics?.name ?? r.ref }) : t('projects:setup.toast.returned', { ref: r.ref, name: r.makerName });
      toast.success(msg);
      announce(msg);
      setConfirm(null);
      return true;
    } catch (e) {
      setProblem(e);
      return false;
    }
  };
  return (
    <Panel title={t('projects:setup.review.title')}>
      <div className="space-y-4" data-testid="setup-review">
        {problem && !confirm ? <ProblemAlert error={problem} /> : null}
        <KeyValueList
          className="@container"
          items={[
            { label: t('projects:setup.basics.name'), value: r.basics ? <bdi>{r.basics.name}</bdi> : '—' },
            { label: t('projects:setup.basics.code'), value: r.basics ? <bdi dir="ltr">{r.basics.code}</bdi> : '—' },
            { label: t('projects:setup.basics.city'), value: r.basics ? <bdi>{r.basics.city}</bdi> : '—' },
            { label: t('projects:setup.basics.kind'), value: r.basics ? t(`projects:kind.${r.basics.kind}`) : '—' },
            { label: t('projects:setup.site.site'), value: site ? <bdi>{site.name}</bdi> : r.site ? <bdi dir="ltr">{r.site.siteId}</bdi> : '—' },
            { label: t('projects:setup.site.entity'), value: site ? <span><bdi>{site.legalEntityName}</bdi> <span className="text-xs text-muted">({t('projects:common.legalEntityNote')})</span></span> : '—' },
            {
              label: t('projects:setup.steps.structure'),
              value: r.structure ? (
                <ul className="space-y-0.5">
                  {r.structure.towers.map((x) => (
                    <li key={x.name}>
                      {t('projects:p360.group.tower', { label: x.name })}: {f.count(x.floors)} × {f.count(x.unitsPerFloor)}
                    </li>
                  ))}
                  {r.structure.phases.map((x) => (
                    <li key={x.label}>
                      <bdi>{x.label}</bdi>: {f.count(x.plots)}
                    </li>
                  ))}
                  <li className="font-medium">{t('projects:setup.plannedUnits', { count: f.count(r.plannedUnits) })}</li>
                </ul>
              ) : (
                '—'
              ),
            },
          ]}
        />
        {r.state === 'active' ? (
          <InlineAlert tone="success" data-testid="setup-active">
            {t('projects:setup.review.activatedBy', { name: r.decidedByName ?? '', date: f.date(r.decidedAt ?? r.createdAt) })}{' '}
            <Link href={PRJ.p360(r.id)} data-testid="setup-open-360">
              {t('projects:setup.review.open360')}
            </Link>
          </InlineAlert>
        ) : r.state === 'submitted' ? (
          <div className="space-y-3">
            {r.decideBlocked === 'own_request' ? (
              <InlineAlert tone="warning" data-testid="setup-own-request">
                {t('projects:setup.review.ownRequest')}
              </InlineAlert>
            ) : r.canDecide ? null : (
              <p className="text-sm text-muted" data-testid="setup-waiting">
                {r.mine ? t('projects:setup.review.waiting', { name: r.makerName }) : t('projects:setup.review.notApprover')}
              </p>
            )}
            {r.canDecide && (
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon={Check} onPress={() => setConfirm('activate')} data-testid="setup-activate">
                  {t('projects:setup.review.approve')}
                </Button>
                <Button variant="secondary" icon={Undo2} onPress={() => setConfirm('return')} data-testid="setup-return">
                  {t('projects:setup.review.return')}
                </Button>
              </div>
            )}
          </div>
        ) : r.canEdit ? (
          <div className="space-y-3">
            <p className="text-sm text-text">{r.canSubmit ? t('projects:setup.review.ready') : t('projects:setup.review.missing')}</p>
            <Button variant="primary" icon={Send} onPress={() => void submit()} isPending={act.isPending} isDisabled={!r.canSubmit} data-testid="setup-submit">
              {t('projects:setup.review.submit')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">{t('projects:setup.readOnly', { state: t(`projects:state.${r.state}`) })}</p>
        )}
        <LinkButton variant="quiet" icon={ArrowLeft} href={PRJ.setup()}>
          {t('projects:setup.back')}
        </LinkButton>
      </div>
      <ConfirmDialog
        isOpen={confirm === 'activate'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('projects:setup.review.approve')}
        effect={t('projects:setup.review.approveEffect', { name: r.basics?.name ?? r.ref })}
        confirmLabel={t('projects:setup.review.approve')}
        problem={problem ? <ProblemAlert error={problem} /> : undefined}
        onConfirm={() => decide('activate')}
      />
      <ConfirmDialog
        isOpen={confirm === 'return'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('projects:setup.review.return')}
        effect={t('projects:setup.review.returnEffect', { name: r.makerName })}
        confirmLabel={t('projects:setup.review.return')}
        reasonLabel={t('projects:setup.review.returnReason')}
        problem={problem ? <ProblemAlert error={problem} /> : undefined}
        onConfirm={(reason) => decide('return', reason)}
      />
    </Panel>
  );
}

function History({ r }: { r: ProjectSetupRecord }) {
  const { t } = useT();
  const f = useInvFormat();
  return (
    <Panel title={t('projects:setup.history')}>
      <ol className="space-y-2 border-s border-border ps-4 text-sm" data-testid="setup-history">
        {r.history.map((h, i) => (
          <li key={`${h.at}-${i}`} data-action={h.action}>
            <p className="text-text">{t(`projects:setup.historyAction.${h.action}`, { name: h.byName, step: h.step ? t(`projects:setup.steps.${h.step}`) : '', note: h.note ?? '' })}</p>
            <p className="text-xs text-muted">{f.when(h.at)}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
