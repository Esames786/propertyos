import { ApiError, type WorkspaceProfile } from '@repo/contracts';
import { formatPkPhone, LOCALE_META, normalizePkPhone } from '@repo/i18n';
import { Badge, Button, cn, InlineAlert, useAnnounce, useApiMutation, useT } from '@repo/ui';
import { BadgeCheck, Building2, FolderKanban, PencilLine, ShieldCheck, UserRound, UsersRound, type LucideIcon } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { StepActions, StepFrame } from './chrome';
import { toWorkspaceSetup, type SetupDraft, type SetupStep } from './draft';

const phone = (v: string) => {
  const e164 = normalizePkPhone(v);
  return e164 ? formatPkPhone(e164) : v;
};

/** Step 6: everything on one page, each section with its own Edit link, then the simulated submit. */
export function ReviewStep({
  draft,
  autoFocus,
  onEdit,
  onBack,
  onSubmitted,
}: {
  draft: SetupDraft;
  autoFocus: boolean;
  onEdit: (step: SetupStep) => void;
  onBack: () => void;
  onSubmitted: (profile: WorkspaceProfile) => void;
}) {
  const { t } = useT();
  const announce = useAnnounce();
  const submit = useApiMutation<WorkspaceProfile>();
  const [failed, setFailed] = useState<string | null>(null);
  const { account, organisation, project } = draft;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFailed(null);
    try {
      const profile = await submit.mutateAsync({ method: 'POST', path: '/workspace', body: toWorkspaceSetup(draft) });
      onSubmitted(profile);
    } catch (error) {
      const key = error instanceof ApiError ? error.problem.messageKey : 'errors:network.unavailable';
      setFailed(key);
      announce(t('start:setup.review.failed'), 'assertive');
    }
  };

  const invites = draft.invites.filter((r) => r.email.trim());

  return (
    <StepFrame step="review" title={t('start:setup.review.heading')} intro={t('start:setup.review.intro')} autoFocus={autoFocus} testId="setup-step-review">
      <form onSubmit={onSubmit} noValidate>
        <div className="grid gap-4 md:grid-cols-2">
          <ReviewSection icon={UserRound} title={t('start:setup.review.account')} onEdit={() => onEdit('account')} testId="review-account">
            <dl className="space-y-2.5">
            <Row label={t('start:setup.account.fullName')}>
              <bdi>{account.fullName}</bdi>
            </Row>
            <Row label={t('start:setup.account.email')}>
              <bdi className="ltr-ref break-all">{account.email}</bdi>
              <Badge tone="demo" icon={BadgeCheck} className="mt-1">
                {t('start:setup.review.verified')}
              </Badge>
            </Row>
            <Row label={t('start:setup.account.mobile')}>
              <bdi className="ltr-ref">{phone(account.phone)}</bdi>
            </Row>
            </dl>
          </ReviewSection>

          <ReviewSection icon={Building2} title={t('start:setup.review.organisation')} onEdit={() => onEdit('organisation')} testId="review-organisation">
            <dl className="space-y-2.5">
            <Row label={t('start:setup.organisation.name')}>
              <bdi>{organisation.name}</bdi>
            </Row>
            {organisation.type && <Row label={t('start:setup.organisation.type')}>{t(`start:setup.organisation.types.${organisation.type}`)}</Row>}
            {organisation.city && <Row label={t('start:setup.organisation.city')}>{t(`start:cities.${organisation.city}`)}</Row>}
            <Row label={t('start:setup.organisation.officePhone')}>
              {organisation.officePhone.trim() ? <bdi className="ltr-ref">{phone(organisation.officePhone)}</bdi> : t('start:setup.review.notGiven')}
            </Row>
            <Row label={t('start:setup.organisation.language')}>{LOCALE_META[organisation.language].nativeName}</Row>
            <Row label={t('start:setup.organisation.currency')}>{t('start:setup.organisation.currencyValue')}</Row>
            </dl>
          </ReviewSection>

          <ReviewSection icon={FolderKanban} title={t('start:setup.review.project')} onEdit={() => onEdit('project')} testId="review-project">
            {draft.projectState === 'skipped' || !project.type ? (
              <Skipped>{t('start:setup.project.skipped')}</Skipped>
            ) : (
              <dl className="space-y-2.5">
                <Row label={t('start:setup.project.name')}>
                  <bdi>{project.name}</bdi>
                </Row>
                <Row label={t('start:setup.project.type')}>{t(`start:setup.project.types.${project.type}`)}</Row>
                {project.city && <Row label={t('start:setup.project.city')}>{t(`start:cities.${project.city}`)}</Row>}
                <Row label={t('start:setup.project.units')}>
                  <span className="tabular">{project.expectedUnits}</span>
                </Row>
              </dl>
            )}
          </ReviewSection>

          <ReviewSection icon={UsersRound} title={t('start:setup.review.team')} onEdit={() => onEdit('team')} testId="review-team">
            {draft.teamState === 'skipped' || invites.length === 0 ? (
              <Skipped>{t('start:setup.team.skipped')}</Skipped>
            ) : (
              <ul className="space-y-2">
                {invites.map((r) => (
                  <li key={r.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                    <bdi className="ltr-ref min-w-0 break-all text-text">{r.email}</bdi>
                    {r.role && <span className="text-muted">{t(`common:persona.${r.role}`)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </ReviewSection>
        </div>

        <p className="mt-6 flex items-start gap-2 rounded-control bg-demo-soft px-3 py-3 text-sm text-text">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-demo" />
          <span>{t('start:setup.review.submitNote')}</span>
        </p>
        {failed && (
          <InlineAlert tone="error" role="alert" title={t('start:setup.review.failed')} className="mt-4">
            {t(failed as 'errors:network.unavailable')} {t('errors:network.nothingChanged')}
          </InlineAlert>
        )}
        <StepActions onBack={onBack} submitLabel={t('start:setup.actions.submit')} pending={submit.isPending} testId="setup-review" />
      </form>
    </StepFrame>
  );
}

function ReviewSection({ icon: Icon, title, onEdit, children, testId }: { icon: LucideIcon; title: string; onEdit: () => void; children: ReactNode; testId: string }) {
  const { t } = useT();
  const id = useId();
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-tile border border-border bg-raised p-4 sm:p-5" data-testid={testId}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={id} className="flex items-center gap-2 text-base font-bold text-text">
          <Icon aria-hidden className="size-4 text-muted" />
          {title}
        </h2>
        <Button variant="quiet" size="sm" icon={PencilLine} onPress={onEdit} aria-label={t('start:setup.actions.edit', { section: title })} data-testid={`${testId}-edit`} className="-me-2">
          {t('common:actions.edit')}
        </Button>
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn('flex min-w-0 flex-col items-start text-sm font-medium text-text')}>{children}</dd>
    </div>
  );
}

function Skipped({ children }: { children: string }) {
  return <p className="text-sm text-muted">{children}</p>;
}
