import type { WorkspaceProfile } from '@repo/contracts';
import { LOCALE_META, Trans } from '@repo/i18n';
import { Button, IconTile, Link, useReducedMotion, useSession, useT } from '@repo/ui';
import { Building2, Check, Compass, FolderKanban, Info, Languages, MailX, UsersRound } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { focusHeading } from '../entry';

/**
 * After the simulated submit. Says plainly that nothing was provisioned, shows what was recorded
 * in this tab, and offers the fictional demo workspace (with the tour) or a way back.
 */
export function DoneStep({
  profile,
  autoFocus,
  launching,
  onOpenDemo,
  getStartedHref,
}: {
  profile: WorkspaceProfile;
  autoFocus: boolean;
  launching: boolean;
  onOpenDemo: () => void;
  getStartedHref: string;
}) {
  const { t } = useT();
  const { tenant, personas } = useSession();
  const reduced = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const manager = personas.find((p) => p.id === 'manager');

  useEffect(() => {
    if (autoFocus) focusHeading(heading.current);
  }, [autoFocus]);

  const recorded = [
    { icon: Building2, label: t('start:setup.done.recorded.company'), value: <bdi>{profile.organisation.name}</bdi> },
    {
      icon: FolderKanban,
      label: t('start:setup.done.recorded.project'),
      value: profile.project ? <bdi>{profile.project.name}</bdi> : t('start:setup.done.recorded.skipped'),
    },
    {
      icon: UsersRound,
      label: t('start:setup.done.recorded.team'),
      value: profile.invites.length ? t('start:setup.done.recorded.people', { count: profile.invites.length }) : t('start:setup.done.recorded.skipped'),
    },
    { icon: Languages, label: t('start:setup.done.recorded.language'), value: LOCALE_META[profile.organisation.language].nativeName },
  ];

  return (
    <div className="mx-auto max-w-3xl pt-2 sm:pt-6" data-testid="setup-done">
      <div className="flex flex-col items-center text-center">
        <motion.span
          aria-hidden
          initial={reduced ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', bounce: 0.55, duration: 0.7 }}
          className="grid size-20 place-items-center rounded-pill bg-tile-emerald text-on-tile shadow-lift ring-8 ring-tile-emerald-soft"
        >
          <Check className="size-10" strokeWidth={3} />
        </motion.span>
        <p className="mt-6 text-xs font-semibold tracking-[0.08em] text-accent uppercase">{t('start:setup.done.eyebrow')}</p>
        <h1 id="page-title" ref={heading} tabIndex={-1} className="mt-2 font-display text-[2rem] leading-tight text-text outline-none sm:text-[2.6rem] [:lang(ur)_&]:leading-[1.75] [:lang(ur)_&]:pt-1">
          {t('start:setup.done.heading')}
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted" data-testid="setup-done-body">
          <Trans t={t} i18nKey="start:setup.done.body" values={{ company: profile.organisation.name }} components={{ b: <bdi className="font-semibold text-text" /> }} />
        </p>
      </div>

      <div className="mt-8 rounded-card border border-demo/30 bg-demo-soft p-4 sm:p-5" role="note">
        <p className="flex items-start gap-2 text-sm font-semibold text-text">
          <MailX aria-hidden className="mt-0.5 size-4 shrink-0 text-demo" />
          {t('start:setup.done.nothingSent')}
        </p>
      </div>

      <section aria-labelledby="setup-recorded" className="mt-6 rounded-card border border-border bg-panel p-5 shadow-card sm:p-6">
        <h2 id="setup-recorded" className="text-lg font-bold text-text">
          {t('start:setup.done.recordedTitle')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('start:setup.done.recordedBody')}</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {recorded.map((r) => (
            <li key={r.label} className="flex items-center gap-3 rounded-tile border border-border bg-raised p-3.5">
              <IconTile icon={r.icon} hue="slate" size="md" />
              <span className="min-w-0">
                <span className="block text-xs text-muted">{r.label}</span>
                <span className="block truncate text-sm font-semibold text-text">{r.value}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="setup-next" className="mt-6 rounded-card border border-border bg-panel p-5 shadow-raised sm:p-6">
        <div className="flex items-start gap-3">
          <IconTile icon={Compass} hue="emerald" size="lg" />
          <div className="min-w-0">
            <h2 id="setup-next" className="text-lg font-bold text-text">
              {t('start:setup.done.nextTitle')}
            </h2>
            <p className="mt-1 text-sm text-muted">
              <Trans
                t={t}
                i18nKey="start:setup.done.nextBody"
                values={{ tenant: tenant.name, name: manager?.displayName ?? '' }}
                components={{ b: <bdi className="font-semibold text-text" /> }}
              />
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button variant="primary" size="lg" icon={Compass} onPress={onOpenDemo} isPending={launching} data-testid="setup-open-demo" className="max-sm:w-full">
            {t('start:setup.done.openDemo')}
          </Button>
          <Link
            href={getStartedHref}
            variant="plain"
            data-testid="setup-back-to-start"
            className="inline-flex min-h-12 items-center justify-center rounded-control border border-border-control bg-panel px-5 text-base font-medium text-text outline-none data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
          >
            {t('start:frame.backToStart')}
          </Link>
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs text-muted">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{t('start:setup.done.fullProduct')}</span>
        </p>
      </section>
    </div>
  );
}
