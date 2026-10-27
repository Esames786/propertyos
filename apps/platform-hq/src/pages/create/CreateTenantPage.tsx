import {
  ApiError,
  type ActivationResult,
  type ContractDraft,
  type EditionKey,
  type ModuleCatalog,
  type RateCard,
  type TenantDetail,
  type TenantDraft,
  type UsageDimension,
  type WorkspaceRequest,
} from '@repo/contracts';
import { directionOf, useLocale } from '@repo/i18n';
import { Button, cn, dynamicT, ErrorState, InlineAlert, PageHeader, Skeleton, useAnnounce, useApiMutation, useApiQuery, useNavigation, useQueryParams, useReducedMotion, useT, useToast, useTransport } from '@repo/ui';
import { HQ_CREATE_TOUR, useGuidedTour, useTourModule } from '@repo/ui/onboarding';
import { Compass } from 'lucide-react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LivePriceBar } from '../../components/quote';
import { HQ } from '../../nav.config';
import { useQuote } from '../../lib/useQuote';
import { OrganisationStep, SitesStep, TypeStep } from './steps/basics';
import { DoneStep, QuoteStep, ReviewStep } from './steps/finish';
import { ModulesStep } from './steps/modules';
import { CountsStep, PricingStep, TermsStep } from './steps/pricing';
import { QuoteAside, Stepper } from './WizardChrome';
import { isStep, quantitiesFor, reachedIndex, STEPS, stepIndex, type Step } from './wizard';

type StoredDraft = TenantDraft & { activatedTenantId?: string };
interface RateCardResponse {
  rateCard: RateCard;
  taxCodes: Array<{ code: string; ratePct: string }>;
}

const slide: Variants = {
  enter: (d: number) => ({ opacity: 0, x: 26 * d }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: -18 * d, transition: { duration: 0.14 } }),
};

/**
 * HQ-003 Create tenant: the Supreme Admin journey of V3.1 doc 03 (type → organisation → sites →
 * modules → pricing → counts → tax & discounts → quote → review → activate). The draft is saved on
 * the mock platform server at every Continue; the step is in the URL (?draft=…&step=…), so Back,
 * refresh and a language switch keep everything. Activation is a labelled simulation: nothing is
 * provisioned. Contracts that trip a commercial-approval rule wait for an approver (D-14).
 */
export default function CreateTenantPage() {
  const { t } = useT();
  const { location, navigate } = useNavigation();
  const setParams = useQueryParams();
  const params = new URLSearchParams(location.search);
  const draftId = params.get('draft');
  const stepParam = params.get('step');
  const fromRequest = params.get('from');

  const catalog = useApiQuery<ModuleCatalog>({ method: 'GET', path: '/platform/catalog' });
  const rateCard = useApiQuery<RateCardResponse>({ method: 'GET', path: '/platform/rate-card' });
  const stored = useApiQuery<StoredDraft>(draftId ? { method: 'GET', path: `/platform/tenant-drafts/${draftId}` } : null);
  const requests = useApiQuery<WorkspaceRequest[]>(fromRequest && !draftId ? { method: 'GET', path: '/platform/requests' } : null);

  if (catalog.isError || rateCard.isError || stored.isError) {
    return <ErrorState error={catalog.error ?? rateCard.error ?? stored.error} onRetry={() => void Promise.all([catalog.refetch(), rateCard.refetch(), stored.refetch()])} />;
  }
  if (!catalog.data || !rateCard.data || (draftId && !stored.data) || (fromRequest && !draftId && !requests.data)) {
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <span className="sr-only">{t('common:state.loading')}</span>
        <Skeleton className="h-10 w-72 rounded-control" />
        <Skeleton className="h-96 rounded-card" />
      </div>
    );
  }
  const request = requests.data?.find((r) => r.id === fromRequest) ?? null;
  return (
    <Wizard
      key={draftId ?? 'new'}
      draft={stored.data ?? null}
      catalog={catalog.data}
      rateCard={rateCard.data}
      request={request}
      stepParam={stepParam}
      go={(next, replace) => setParams({ step: next === 'type' ? null : next, from: null }, { replace: !!replace })}
      openDraft={(id, step) => navigate(`${HQ.createTenant}?draft=${encodeURIComponent(id)}&step=${step}`)}
    />
  );
}

function Wizard({
  draft: initial,
  catalog,
  rateCard,
  request,
  stepParam,
  go,
  openDraft,
}: {
  draft: StoredDraft | null;
  catalog: ModuleCatalog;
  rateCard: RateCardResponse;
  request: WorkspaceRequest | null;
  stepParam: string | null;
  go: (step: Step | 'done', replace?: boolean) => void;
  openDraft: (id: string, step: Step) => void;
}) {
  const { t } = useT();
  const { locale } = useLocale();
  const reduced = useReducedMotion();
  const announce = useAnnounce();
  const toast = useToast();
  const tours = useGuidedTour();
  // First visit to the wizard offers its guided help (HQ-TOUR-002), once, without blocking.
  useTourModule('hq-create');
  const { transport } = useTransport();
  const save = useApiMutation<StoredDraft>();
  const activate = useApiMutation<ActivationResult>();

  const [draft, setDraft] = useState<StoredDraft | null>(initial);
  const [contract, setContract] = useState<ContractDraft | null>(initial?.contract ?? null);
  const [quantities, setQuantities] = useState<Partial<Record<UsageDimension, number>>>(() => (initial ? quantitiesFor(initial) : {}));
  const [result, setResult] = useState<ActivationResult | null>(null);
  const [returnToReview, setReturnToReview] = useState(false);
  /** What the server refused on the last save, for the step it was sent from. */
  const [refused, setRefused] = useState<{ step: Step; messages: string[] } | null>(null);

  const done = stepParam === 'done' && !!draft?.activatedTenantId;
  const tenant = useApiQuery<TenantDetail>(done && !result ? { method: 'GET', path: `/platform/tenants/${draft!.activatedTenantId}` } : null);

  // Which step may be shown: any step up to one past the furthest saved.
  const reached = reachedIndex(draft);
  const requested: Step = isStep(stepParam) ? stepParam : 'type';
  const step: Step = !draft ? 'type' : stepIndex(requested) <= reached + 1 ? requested : STEPS[Math.min(reached + 1, STEPS.length - 1)]!;
  useEffect(() => {
    if (!done && stepParam !== null && stepParam !== step) go(step, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the allowed step differs from the address
  }, [step, stepParam, done]);

  // Focus the new heading after a step change (not on first load); slide in the reading direction.
  const [first] = useState(step);
  const [moved, setMoved] = useState(false);
  if (step !== first && !moved) setMoved(true);
  const [previous, setPrevious] = useState(step);
  const [direction, setDirection] = useState(1);
  if (previous !== step) {
    setPrevious(step);
    setDirection(stepIndex(step) >= stepIndex(previous) ? 1 : -1);
  }
  const slideDir = direction * (directionOf(locale) === 'rtl' ? -1 : 1);

  const pricingSteps: Step[] = ['pricing', 'counts', 'terms', 'quote', 'review'];
  const quote = useQuote(pricingSteps.includes(step) ? contract : null, quantities, draft?.edition ?? null);

  /** Save the patch, mark the step reached, go on (or back to the review when editing from it). */
  const commit = async (from: Step, patch: Partial<TenantDraft>) => {
    const nextStep = returnToReview && stepIndex(from) < stepIndex('review') && reached >= stepIndex('review') ? 'review' : STEPS[stepIndex(from) + 1]!;
    const furthest = STEPS[Math.max(reached, stepIndex(nextStep))]!;
    let saved: StoredDraft;
    try {
      saved = await save.mutateAsync({ method: 'PATCH', path: `/platform/tenant-drafts/${draft!.id}`, body: { ...patch, step: furthest } });
    } catch (error) {
      // The server checks every entry again; anything it refuses is listed here and nothing moves on.
      if (error instanceof ApiError && error.problem.status === 422) setRefused({ step: from, messages: problemMessages(error, t) });
      else toast.error(t('platform:wizard.errors.save'));
      return;
    }
    setRefused(null);
    setDraft(saved);
    // New or changed sites change the declared counts derived from them.
    if (patch.sites) setQuantities(quantitiesFor({ sites: saved.sites, quantities: {} }));
    if (nextStep === 'review') setReturnToReview(false);
    announce(t('platform:wizard.saved'));
    go(nextStep);
  };

  const back = (from: Step) => go(STEPS[Math.max(0, stepIndex(from) - 1)]!);

  const startDraft = async (edition: EditionKey) => {
    if (draft) {
      if (draft.edition !== edition) {
        // A different edition resets the module and price choices that came from the old preset.
        setContract(null);
        await commit('type', { edition, modules: [], contract: null });
      } else await commit('type', { edition });
      return;
    }
    const created = await save.mutateAsync({ method: 'POST', path: '/platform/tenant-drafts', body: { edition } });
    if (request) {
      await save.mutateAsync({
        method: 'PATCH',
        path: `/platform/tenant-drafts/${created.id}`,
        body: {
          step: 'organisation',
          organisation: { displayName: request.organisation, legalName: request.organisation, city: request.city, timezone: 'Asia/Karachi', currency: 'PKR', language: 'en-PK', contactName: request.contactName, contactEmail: '', contactPhone: '' },
          sites: request.expectedUnits ? [{ id: `site_${created.id}`, name: request.organisation.replace(/\s*\(demo\)\s*$/i, ''), city: request.city, kind: 'residential', buildings: 1, declaredUnits: request.expectedUnits }] : [],
        },
      });
    } else await save.mutateAsync({ method: 'PATCH', path: `/platform/tenant-drafts/${created.id}`, body: { step: 'organisation' } });
    openDraft(created.id, 'organisation');
  };

  // Entering the pricing step for the first time: the edition preset priced from the rate card.
  useEffect(() => {
    if (step !== 'pricing' || contract || !draft?.edition) return;
    let cancelled = false;
    void transport
      .request<ContractDraft>({ method: 'POST', path: '/platform/contract-templates', body: { edition: draft.edition } })
      .then((c) => {
        if (cancelled) return;
        // Site-scoped add-ons are charged for the sites the module was granted for.
        const online = draft.modules.find((m) => m.module === 'online_payments');
        if (online && !c.components.some((x) => x.module === 'online_payments')) {
          const line = rateCard.rateCard.lines.find((l) => l.module === 'online_payments');
          if (line?.unitPrice)
            c.components.push({
              id: 'cmp_mod_online_payments',
              type: 'PER_MODULE',
              rateCardLineId: line.id,
              module: 'online_payments',
              unitPrice: line.unitPrice,
              siteIds: online.sites === 'all' ? draft.sites.map((s) => s.id) : [...online.sites],
              cadence: 'monthly',
              proration: 'actual_days',
              effectiveFrom: c.terms.start,
            });
        }
        setContract(c);
      });
    return () => {
      cancelled = true;
    };
  }, [step, contract, draft, transport, rateCard]);

  const runActivate = async () => {
    try {
      const r = await activate.mutateAsync({ method: 'POST', path: `/platform/tenant-drafts/${draft!.id}/activate` });
      setResult(r);
      setDraft((d) => (d ? { ...d, activatedTenantId: r.tenantId } : d));
      announce(r.contractStatus === 'pending_approval' ? t('platform:wizard.done.pendingTitle', { name: draft!.organisation!.displayName }) : t('platform:wizard.done.title', { name: draft!.organisation!.displayName }));
      go('done');
    } catch (error) {
      if (error instanceof ApiError && error.problem.status === 422) setRefused({ step: 'review', messages: problemMessages(error, t) });
      toast.error(t('platform:wizard.errors.activate'));
    }
  };

  const doneResult = useMemo<ActivationResult | null>(() => {
    if (result) return result;
    const d = tenant.data;
    return d ? { tenantId: d.id, status: d.status, contractStatus: d.contractStatus === 'pending_approval' ? 'pending_approval' : 'active' } : null;
  }, [result, tenant.data]);

  if (done) {
    return doneResult ? <DoneStep result={doneResult} name={draft!.organisation?.displayName ?? ''} /> : <Skeleton className="mx-auto h-80 max-w-2xl rounded-card" />;
  }

  const autoFocus = moved;
  const common = { autoFocus, pending: save.isPending || activate.isPending };
  const edit = (s: Step) => {
    setReturnToReview(true);
    go(s);
  };

  let body: ReactNode;
  switch (step) {
    case 'type':
      body = <TypeStep {...common} value={draft?.edition ?? (request ? request.edition : null)} catalog={catalog} onSubmit={(e) => void startDraft(e)} />;
      break;
    case 'organisation':
      body = <OrganisationStep {...common} onBack={() => back('organisation')} value={draft!.organisation} onSubmit={(o) => void commit('organisation', { organisation: o })} />;
      break;
    case 'sites':
      body = <SitesStep {...common} onBack={() => back('sites')} value={draft!.sites} organisation={draft!.organisation} onSubmit={(s) => void commit('sites', { sites: s })} />;
      break;
    case 'modules':
      body = <ModulesStep {...common} onBack={() => back('modules')} value={draft!.modules} edition={draft!.edition!} catalog={catalog} sites={draft!.sites} onSubmit={(m) => void commit('modules', { modules: m })} />;
      break;
    case 'pricing':
      body = contract ? (
        <PricingStep
          {...common}
          onBack={() => back('pricing')}
          contract={contract}
          onChange={setContract}
          rateCard={rateCard.rateCard}
          edition={draft!.edition!}
          sites={draft!.sites}
          modules={draft!.modules}
          onSubmit={() => void commit('pricing', { contract })}
        />
      ) : (
        <Skeleton className="h-96 rounded-card" />
      );
      break;
    case 'counts':
      body = (
        <CountsStep
          {...common}
          onBack={() => back('counts')}
          contract={contract!}
          quantities={quantities}
          onChange={setQuantities}
          onSubmit={() => void commit('counts', { quantities })}
        />
      );
      break;
    case 'terms':
      body = (
        <TermsStep
          {...common}
          onBack={() => back('terms')}
          contract={contract!}
          onChange={setContract}
          taxCodes={rateCard.taxCodes}
          quote={quote.data}
          onSubmit={() => void commit('terms', { contract })}
        />
      );
      break;
    case 'quote':
      body = <QuoteStep {...common} onBack={() => back('quote')} quote={quote.data} onSubmit={() => void commit('quote', {})} />;
      break;
    case 'review':
      body = (
        <ReviewStep
          {...common}
          onBack={() => back('review')}
          draft={{ ...draft!, contract, quantities }}
          quote={quote.data}
          catalog={catalog}
          onEdit={edit}
          onActivate={runActivate}
        />
      );
      break;
  }

  const showAside = (['pricing', 'counts', 'terms'] as Step[]).includes(step);
  return (
    <div className="space-y-5" data-testid="create-tenant">
      <PageHeader
        title={t('platform:pages.createTenant')}
        breadcrumbs={[{ label: t('platform:nav.tenants'), href: HQ.tenants }, { label: t('platform:pages.createTenant') }]}
        actions={
          step === 'type' ? (
            <Button variant="quiet" icon={Compass} onPress={() => tours.start(HQ_CREATE_TOUR.id)} data-testid="wizard-guide">
              {t('platform:createTour.showMe')}
            </Button>
          ) : undefined
        }
      />
      <div className={cn('grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]', showAside && 'xl:grid-cols-[15rem_minmax(0,1fr)_16rem]')}>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Stepper current={step} reached={reached} onGo={(s) => go(s)} />
        </div>
        <div className="min-w-0">
          {showAside && <LivePriceBar quote={quote.data} loading={quote.isFetching} unavailable={quote.isError} testId="price-bar" />}
          {refused?.step === step && <RefusedEntries messages={refused.messages} />}
          <AnimatePresence mode="wait" custom={slideDir} initial={false}>
            <motion.div
              key={step}
              custom={slideDir}
              variants={reduced ? undefined : slide}
              initial={reduced ? false : 'enter'}
              animate="center"
              exit={reduced ? undefined : 'exit'}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {body}
            </motion.div>
          </AnimatePresence>
        </div>
        {showAside && (
          <div className="max-xl:hidden xl:sticky xl:top-24 xl:self-start">
            <QuoteAside quote={quote.data} loading={quote.isFetching} unavailable={quote.isError} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Field problems from a 422, in the reader's language (codes are translation keys with params). */
function problemMessages(error: ApiError, t: ReturnType<typeof useT>['t']): string[] {
  const tr = dynamicT(t);
  const messages = Object.values(error.problem.errors ?? {})
    .flat()
    .map((e) => tr(e.code, e.params));
  return messages.length ? [...new Set(messages)] : [tr(error.problem.messageKey)];
}

/** The server's refusal, focused so keyboard and screen-reader users land on it. */
function RefusedEntries({ messages }: { messages: string[] }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [messages]);
  return (
    <div ref={ref} tabIndex={-1} className="mb-4 outline-none" data-testid="wizard-refused">
      <InlineAlert tone="error" role="alert" title={t('platform:validation.serverTitle')}>
        <p>{t('platform:validation.serverBody')}</p>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </InlineAlert>
    </div>
  );
}
