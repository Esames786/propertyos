import type { ActivationResult, ModuleCatalog, QuotePreview, TenantDraft } from '@repo/contracts';
import { Badge, Button, buttonClass, ConfirmDialog, IconTile, InlineAlert, Link, Skeleton, useT } from '@repo/ui';
import { BadgeCheck, Calculator, FileClock, PencilLine, Plus, Printer, Rocket } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { componentLabel } from '../../../components/PricingBuilder';
import { ApprovalNotice, QuantitySources, QuoteBreakdown, QuoteTotals } from '../../../components/quote';
import { useHqFormat } from '../../../lib/format';
import { editionName, moduleName } from '../../../lib/labels';
import { HQ } from '../../../nav.config';
import { StepActions, StepFrame } from '../WizardChrome';
import type { Step } from '../wizard';

interface StepProps {
  autoFocus: boolean;
  onBack: () => void;
  pending: boolean;
}

// ---------------------------------------------------------------- 8. Quote

export function QuoteStep({ quote, onSubmit, ...p }: StepProps & { quote: QuotePreview | undefined; onSubmit: () => void }) {
  const { t } = useT();
  const sameAsFirst = quote && quote.regularPeriod.start === quote.nextPeriod.start;
  return (
    <StepFrame step="quote" title={t('platform:wizard.quote.title')} intro={t('platform:wizard.quote.intro')} autoFocus={p.autoFocus} testId="step-quote">
      {!quote ? (
        <Skeleton className="h-64 rounded-tile" />
      ) : (
        <div className="space-y-6">
          <QuoteTotals quote={quote} />
          <QuantitySources quote={quote} />
          <ApprovalNotice approval={quote.approval} />
          <QuoteBreakdown period={quote.firstPeriod} title={t('platform:quote.firstPeriod')} testId="quote-first-breakdown" />
          {!sameAsFirst && <QuoteBreakdown period={quote.nextPeriod} title={t('platform:quote.nextPeriod')} testId="quote-next-breakdown" />}
          <QuoteBreakdown period={quote.regularPeriod} title={t('platform:quote.regularPeriod')} testId="quote-regular-breakdown" />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-tile bg-sunken/60 p-3 text-sm text-muted">
            <span>{t('platform:wizard.quote.preview')}</span>
            <Button variant="quiet" icon={Printer} onPress={() => window.print()}>
              {t('platform:wizard.quote.print')}
            </Button>
          </div>
        </div>
      )}
      <StepActions testId="step-quote" onBack={p.onBack} pending={p.pending} onNext={onSubmit} />
    </StepFrame>
  );
}

// ---------------------------------------------------------------- 9. Review

function ReviewSection({ title, step, onEdit, children }: { title: string; step: Step; onEdit: (s: Step) => void; children: ReactNode }) {
  const { t } = useT();
  return (
    <section aria-label={title} className="rounded-tile border border-border/70 p-4" data-testid={`review-${step}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h2 className="text-sm font-bold text-text">{title}</h2>
        <Button variant="quiet" icon={PencilLine} className="-ms-2 max-w-full text-start whitespace-normal" onPress={() => onEdit(step)} data-testid={`review-edit-${step}`}>
          {t('platform:wizard.review.edit', { section: title })}
        </Button>
      </div>
      <div className="mt-2 text-sm text-text">{children}</div>
    </section>
  );
}

export function ReviewStep({
  draft,
  quote,
  catalog,
  onEdit,
  onActivate,
  ...p
}: StepProps & { draft: TenantDraft; quote: QuotePreview | undefined; catalog: ModuleCatalog; onEdit: (s: Step) => void; onActivate: () => Promise<void> }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const [confirm, setConfirm] = useState(false);
  const needsApproval = quote?.approval.required ?? false;
  const org = draft.organisation!;
  const contract = draft.contract!;
  const units = draft.sites.reduce((n, s) => n + s.declaredUnits, 0);
  return (
    <StepFrame step="review" title={t('platform:wizard.review.title')} intro={t('platform:wizard.review.intro')} autoFocus={p.autoFocus} testId="step-review">
      <div className="grid gap-3 lg:grid-cols-2">
        <ReviewSection title={t('platform:wizard.steps.type')} step="type" onEdit={onEdit}>
          {draft.edition ? editionName(t, draft.edition) : '—'}
        </ReviewSection>
        <ReviewSection title={t('platform:wizard.steps.organisation')} step="organisation" onEdit={onEdit}>
          <p className="font-semibold">
            <bdi>{org.displayName}</bdi>
          </p>
          <p className="text-muted">
            <bdi>{org.legalName}</bdi> · {org.city}
          </p>
          <p className="text-muted">
            <bdi>{org.contactName}</bdi> · <bdi dir="ltr">{org.contactEmail}</bdi>
          </p>
        </ReviewSection>
        <ReviewSection title={t('platform:wizard.steps.sites')} step="sites" onEdit={onEdit}>
          <p>{t('platform:wizard.sites.total', { count: draft.sites.length, units })}</p>
          <ul className="mt-1 text-muted">
            {draft.sites.map((s) => (
              <li key={s.id}>
                <bdi>{s.name}</bdi> · {s.city} · {t('platform:wizard.review.siteUnits', { count: s.declaredUnits })}
              </li>
            ))}
          </ul>
        </ReviewSection>
        <ReviewSection title={t('platform:wizard.steps.modules')} step="modules" onEdit={onEdit}>
          <p>{t('platform:wizard.review.modules', { count: draft.modules.length })}</p>
          <p className="mt-1 text-muted">
            {draft.modules
              .filter((m) => catalog.modules.find((x) => x.key === m.module)?.alwaysOn !== true)
              .map((m) => moduleName(t, m.module))
              .join(', ')}
          </p>
        </ReviewSection>
        <ReviewSection title={t('platform:wizard.steps.pricing')} step="pricing" onEdit={onEdit}>
          <p>{t('platform:wizard.review.terms', { start: fmt.date(contract.terms.start), frequency: t(`platform:cadence.${contract.terms.billingFrequency}`) })}</p>
          <ul className="mt-1 text-muted">
            {contract.components.map((c) => (
              <li key={c.id}>
                {componentLabel(t, c)}
                {c.unitPrice && c.type !== 'FREE' ? ` · ${fmt.money(c.unitPrice)}` : ''}
              </li>
            ))}
          </ul>
        </ReviewSection>
        <ReviewSection title={t('platform:wizard.steps.terms')} step="terms" onEdit={onEdit}>
          <p>{t(`platform:taxCodes.${contract.terms.tax.code.replace(/-/g, '_') as 'NONE'}`, { rate: contract.terms.tax.ratePct })}</p>
          <p className="text-muted">{contract.discounts.length ? t('platform:wizard.review.discounts', { count: contract.discounts.length }) : t('platform:wizard.terms.noDiscounts')}</p>
        </ReviewSection>
      </div>

      <div className="mt-6 space-y-4">
        {quote ? <QuoteTotals quote={quote} /> : <Skeleton className="h-28 rounded-tile" />}
        {quote && <ApprovalNotice approval={quote.approval} />}
        <InlineAlert tone="info" title={t('platform:wizard.review.simulationTitle')}>
          {t('platform:wizard.review.simulationBody')}
        </InlineAlert>
      </div>

      <StepActions
        testId="step-review"
        onBack={p.onBack}
        pending={p.pending}
        nextLabel={needsApproval ? t('platform:wizard.review.submitForApproval') : t('platform:wizard.review.activate')}
        onNext={() => setConfirm(true)}
      />
      <ConfirmDialog
        isOpen={confirm}
        onOpenChange={setConfirm}
        title={needsApproval ? t('platform:wizard.review.confirmApprovalTitle') : t('platform:wizard.review.confirmTitle')}
        effect={needsApproval ? t('platform:wizard.review.confirmApprovalEffect', { name: org.displayName }) : t('platform:wizard.review.confirmEffect', { name: org.displayName })}
        confirmLabel={needsApproval ? t('platform:wizard.review.submitForApproval') : t('platform:wizard.review.activate')}
        onConfirm={onActivate}
      />
    </StepFrame>
  );
}

// ---------------------------------------------------------------- Done

export function DoneStep({ result, name }: { result: ActivationResult; name: string }) {
  const { t } = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const pending = result.contractStatus === 'pending_approval';
  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-2xl rounded-card border border-border bg-panel p-6 text-center shadow-raised sm:p-10" data-testid="step-done">
      <div className="flex justify-center">
        <IconTile icon={pending ? FileClock : BadgeCheck} hue={pending ? 'amber' : 'emerald'} variant="solid" size="xl" className="animate-pop-in" />
      </div>
      <h1 id="page-title" ref={heading} tabIndex={-1} className="mt-5 text-[1.75rem] leading-tight font-bold text-text outline-none">
        {pending ? t('platform:wizard.done.pendingTitle', { name }) : t('platform:wizard.done.title', { name })}
      </h1>
      <p className="mx-auto mt-2 max-w-lg text-muted">{pending ? t('platform:wizard.done.pendingBody') : t(`platform:wizard.done.body_${result.status === 'trial' ? 'trial' : 'active'}`)}</p>
      <div className="mt-4 flex justify-center">
        <Badge tone={pending ? 'warning' : 'success'} icon={pending ? FileClock : Rocket}>
          {pending ? t('platform:status.awaiting_approval') : t(`platform:status.${result.status}`)}
        </Badge>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link variant="plain" href={HQ.tenant(result.tenantId)} className={buttonClass('primary', 'lg')} data-testid="done-open-tenant">
          {t('platform:wizard.done.openTenant')}
        </Link>
        <Link variant="plain" href={`${HQ.simulator}?tenant=${result.tenantId}`} className={buttonClass('secondary', 'lg')}>
          <Calculator aria-hidden className="size-4" />
          {t('platform:wizard.done.simulate')}
        </Link>
        <Link variant="plain" href={HQ.createTenant} className={buttonClass('quiet', 'lg')} data-testid="done-create-another">
          <Plus aria-hidden className="size-4" />
          {t('platform:wizard.done.another')}
        </Link>
      </div>
      <p className="mt-6 text-xs text-muted">{t('platform:wizard.done.simulated')}</p>
    </section>
  );
}
