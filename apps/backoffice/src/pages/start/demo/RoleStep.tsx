import { Badge, Button, cn, DirectionalIcon, IconTile, RevealItem, SegmentedControl, Stagger, Switch, useQueryParam, useSession, useT } from '@repo/ui';
import { ArrowRight, Check, FolderKanban, HandCoins, ListChecks, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Radio, RadioGroup } from 'react-aria-components';
import { LINKS } from '../../../nav.config';
import { EntryBackLink } from '../EntryFrame';
import { demoOf, DEMO_KINDS, entryHref, focusHeading, isDemoKind, isDemoRole, RECOMMENDED, ROLE_LOOK, ROLES_OF, SOCIETY_STARTS, type DemoKind, type DemoRole, type SocietyStart } from '../entry';

const START_ICON = { collecting: HandCoins, ready: ListChecks, fresh: Upload } as const;
/** Test ids: "Before setup" keeps the id of the earlier switch it replaces. */
const START_TEST_ID: Record<SocietyStart, string> = { collecting: 'demo-start-collecting', ready: 'demo-start-ready', fresh: 'demo-fresh' };

const POINTS = ['a', 'b', 'c'] as const;

/**
 * Demo step 1: choose the demo (a developer or a society, F-9) and which fictional colleague to
 * explore as. Each role sees different menus, figures and actions; the cards say what. The developer
 * demo can clear this tab's earlier changes; the society demo starts with collections open (the
 * November bills issued, proofs waiting), ready to bill, or before setup (the building manager
 * imports the flat register from the sample file).
 */
export function RoleStep({
  next,
  autoFocus,
  onContinue,
}: {
  next: string | null;
  autoFocus: boolean;
  onContinue: (role: DemoRole, choice: { fresh: boolean; start: SocietyStart }) => void;
}) {
  const { t } = useT();
  const { personas, persona, tenants } = useSession();
  const [demoParam, setDemoParam] = useQueryParam('demo');
  const current = isDemoRole(persona?.id) ? persona.id : null;
  const kind: DemoKind = isDemoKind(demoParam) ? demoParam : current ? demoOf(current) : 'developer';
  const roles = ROLES_OF[kind];
  const [chosen, setChosen] = useState<DemoRole | null>(current);
  const role = chosen && roles.includes(chosen) ? chosen : RECOMMENDED[kind];
  const tenant = tenants.find((x) => x.id === personas.find((p) => p.id === roles[0])?.tenantId) ?? tenants[0]!;
  const [fresh, setFresh] = useState(false);
  const [start, setStart] = useState<SocietyStart>('collecting');
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (autoFocus) focusHeading(heading.current);
  }, [autoFocus]);

  return (
    <div className="mx-auto max-w-5xl pt-1 sm:pt-4" data-testid="demo-role-step" data-demo={kind}>
      <EntryBackLink href={entryHref(LINKS.getStarted, { next })} testId="demo-back">
        {t('start:frame.backToStart')}
      </EntryBackLink>
      <div className="mt-4 max-w-2xl">
        <p className="text-xs font-semibold tracking-[0.08em] text-accent uppercase">
          {t('start:demo.role.eyebrow')} · <bdi>{tenant.name}</bdi>
        </p>
        <h1 id="page-title" ref={heading} tabIndex={-1} className="mt-2 font-display text-figure leading-tight text-text outline-none sm:text-figure-lg [:lang(ur)_&]:leading-[1.75] [:lang(ur)_&]:pt-1">
          {t('start:demo.role.heading')}
        </h1>
        <p className="mt-3 text-base text-muted sm:text-lg">{t('start:demo.role.intro')}</p>
      </div>

      <div className="mt-6 space-y-2" data-testid="demo-kind">
        <SegmentedControl
          label={t('start:demo.role.chooseDemo')}
          value={kind}
          onChange={(v) => {
            setDemoParam(v === 'developer' ? null : v);
            setFresh(false);
          }}
          testId="demo-kind-control"
          options={DEMO_KINDS.map((k) => ({ id: k, label: t(`start:demo.role.demos.${k}.title`) }))}
        />
        <p className="text-sm text-muted">{t(`start:demo.role.demos.${kind}.body`)}</p>
      </div>

      <RadioGroup value={role} onChange={(v) => setChosen(v as DemoRole)} aria-label={t('start:demo.role.groupLabel')} className="mt-6" data-testid="demo-role-group">
        <Stagger key={kind} className={cn('grid gap-4', kind === 'society' ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3')}>
          {roles.map((id) => {
            const p = personas.find((x) => x.id === id);
            if (!p) return null;
            const look = ROLE_LOOK[id];
            return (
              <RevealItem key={id} className="min-w-0">
                <Radio
                  value={id}
                  data-testid={`demo-role-${id}`}
                  className={cn(
                    'group relative flex h-full cursor-default flex-col gap-4 rounded-card border-2 bg-panel p-5 text-start shadow-card outline-none',
                    'transition-[translate,box-shadow,border-color] duration-[var(--motion-regular)] ease-[var(--ease-emphasized)]',
                    'border-transparent ring-1 ring-border data-hovered:-translate-y-0.5 data-hovered:shadow-lift',
                    'data-selected:border-primary data-selected:ring-0 data-selected:shadow-lift',
                    'data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
                  )}
                >
                  <span className="flex items-start gap-3">
                    <IconTile icon={look.icon} hue={look.hue} variant="solid" size="lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg leading-snug font-bold text-text">
                        <bdi>{p.displayName}</bdi>
                      </span>
                      <span className="block text-sm text-muted">{t(`common:persona.${id}`)}</span>
                    </span>
                    <span
                      aria-hidden
                      className="grid size-6 shrink-0 place-items-center rounded-pill border-2 border-border-control text-on-primary transition-colors duration-[var(--motion-fast)] group-data-selected:border-primary group-data-selected:bg-primary"
                    >
                      <Check className="size-3.5 opacity-0 group-data-selected:opacity-100" strokeWidth={3} />
                    </span>
                  </span>
                  {id === RECOMMENDED[kind] && (
                    <Badge tone="success" icon={Check} className="self-start">
                      {t('start:demo.role.recommended')}
                    </Badge>
                  )}
                  <span className="block text-sm text-text">{t(`start:roles.${id}.summary`)}</span>
                  <span className="block space-y-2 border-t border-border pt-4">
                    {POINTS.map((k) => (
                      <span key={k} className="flex items-start gap-2 text-sm text-muted">
                        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.5} />
                        <span>{t(`start:roles.${id}.points.${k}`)}</span>
                      </span>
                    ))}
                  </span>
                  <span className="mt-auto inline-flex items-center gap-1.5 self-start rounded-pill bg-sunken px-2.5 py-1 text-xs font-medium text-text">
                    <FolderKanban aria-hidden className="size-3.5 text-muted" />
                    {kind === 'society' ? t('start:demo.role.scopeSociety') : p.projectScope === 'all' ? t('start:demo.role.scopeAll') : t('start:demo.role.scopeOne', { project: 'Larkspur Heights' })}
                  </span>
                </Radio>
              </RevealItem>
            );
          })}
        </Stagger>
      </RadioGroup>

      {kind === 'society' && (
        <RadioGroup value={start} onChange={(v) => setStart(v as SocietyStart)} className="mt-8" data-testid="demo-start" aria-label={t('start:demo.role.startLabel')}>
          <p aria-hidden className="mb-3 text-sm font-semibold text-text">{t('start:demo.role.startLabel')}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {SOCIETY_STARTS.map((s) => {
              const Icon = START_ICON[s];
              return (
                <Radio
                  key={s}
                  value={s}
                  data-testid={START_TEST_ID[s]}
                  className="group flex cursor-default items-start gap-3 rounded-tile border-2 border-border bg-panel p-4 outline-none data-hovered:border-border-control data-selected:border-primary data-selected:bg-primary-soft/40 data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
                >
                  <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-text">{t(`start:demo.role.starts.${s}.title`)}</span>
                    <span className="block text-xs text-muted">{t(`start:demo.role.starts.${s}.body`)}</span>
                  </span>
                </Radio>
              );
            })}
          </div>
        </RadioGroup>
      )}

      <div className="mt-6 flex flex-col gap-5 rounded-card border border-border bg-panel p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6">
        {kind === 'developer' ? (
          <Switch isSelected={fresh} onChange={setFresh} label={t('start:demo.role.fresh')} description={t('start:demo.role.freshHint')} testId="demo-fresh" />
        ) : (
          <p className="text-sm text-muted">{t('start:demo.role.linkedApps')}</p>
        )}
        <Button variant="primary" size="lg" onPress={() => onContinue(role, { fresh, start })} data-testid="demo-continue" className="shrink-0 max-sm:w-full">
          <span className="inline-flex items-center gap-2">
            {t('start:demo.role.continue', { name: personas.find((x) => x.id === role)?.displayName ?? '' })}
            <DirectionalIcon icon={ArrowRight} className="size-4" />
          </span>
        </Button>
      </div>
    </div>
  );
}
