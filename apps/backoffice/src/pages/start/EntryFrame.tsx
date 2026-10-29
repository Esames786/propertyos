import { AccessibilityPreferences, Button, cn, Dialog, DirectionalIcon, Link, LocaleToggle, SkipLink, useT } from '@repo/ui';
import { Accessibility, ArrowLeft, ShieldCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';

/**
 * Frame for the entry flow (Get started, demo launch, workspace setup). These pages run outside the
 * signed-in shell, so the frame supplies what the shell normally does: a skip link, the main
 * landmark, the persistent demo notice, language and accessibility controls.
 */
export function EntryFrame({ children, brandHref, testId }: { children: ReactNode; brandHref?: string; testId?: string }) {
  const { t } = useT();
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip bg-bg" data-testid={testId}>
      <SkipLink />
      <Backdrop />
      <p
        className="flex items-center justify-center gap-2 border-b border-demo/20 bg-demo-soft px-4 py-2 text-center text-xs font-medium text-demo sm:text-sm"
        data-testid="demo-notice"
      >
        <ShieldCheck aria-hidden className="size-4 shrink-0" />
        <span>{t('nav:demoEnvironment')}</span>
      </p>
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        {brandHref ? (
          <Link href={brandHref} variant="plain" aria-label={t('start:frame.brandHome', { product: t('common:app.productName') })} className="rounded-control outline-offset-4">
            <BrandMark />
          </Link>
        ) : (
          <BrandMark />
        )}
        <div className="flex shrink-0 items-center gap-2">
          <AccessibilityControl />
          <LocaleToggle />
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 pb-14 outline-none sm:px-6 lg:px-8">
        {children}
      </main>
      <footer className="mx-auto w-full max-w-7xl px-4 pb-6 text-center text-xs text-muted sm:px-6 lg:px-8">
        {t('start:frame.footer', { product: t('common:app.productName') })}
      </footer>
    </div>
  );
}

/** Product mark: the evergreen monogram tile with a brass hairline, as in the shell's brand block. */
export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { t } = useT();
  const product = t('common:app.productName');
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <MonogramTile letter={product.charAt(0)} />
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block font-display text-lg leading-tight text-text" title={t('common:app.codenameNote')}>
            <bdi>{product}</bdi>
          </span>
          <span className="block truncate text-xs text-muted max-[359px]:hidden">{t('start:frame.productLine')}</span>
        </span>
      )}
    </span>
  );
}

export function MonogramTile({ letter, size = 'md' }: { letter: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative grid shrink-0 place-items-center bg-primary font-display leading-none text-on-primary shadow-[inset_0_0_0_1px_rgb(181_138_71/0.55)]',
        size === 'lg' ? 'size-14 rounded-[16px] text-figure-sm' : 'size-10 rounded-[12px] text-xl',
      )}
    >
      {letter}
    </span>
  );
}

/** Opens the device-level accessibility preferences (motion, contrast, sound) in a dialog. */
function AccessibilityControl() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <AriaButton
        onPress={() => setOpen(true)}
        data-testid="entry-accessibility"
        className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-pill border border-border-control bg-panel/70 px-3 text-sm font-medium text-text outline-none transition-colors duration-[var(--motion-fast)] data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus pointer-coarse:min-h-11 pointer-coarse:min-w-11 sm:px-3.5"
      >
        <Accessibility aria-hidden className="size-4 text-muted" />
        <span className="max-sm:sr-only">{t('start:frame.accessibility')}</span>
      </AriaButton>
      <Dialog
        isOpen={open}
        onOpenChange={setOpen}
        title={t('start:frame.accessibilityTitle')}
        footer={
          <Button variant="primary" onPress={() => setOpen(false)}>
            {t('start:frame.done')}
          </Button>
        }
      >
        <AccessibilityPreferences />
      </Dialog>
    </>
  );
}

/** Decorative wash behind the page: a soft evergreen glow and a faint site-plan grid. */
function Backdrop() {
  return (
    <div aria-hidden data-decorative className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,var(--color-primary-soft),transparent_70%)] opacity-80" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,var(--color-bg)),repeating-linear-gradient(90deg,rgb(30_77_66/0.05)_0_1px,transparent_1px_56px),repeating-linear-gradient(0deg,rgb(30_77_66/0.05)_0_1px,transparent_1px_56px)]" />
    </div>
  );
}

/** "Back" link at the top of an entry step. */
export function EntryBackLink({ href, children, testId }: { href: string; children: string; testId?: string }) {
  return (
    <Link
      href={href}
      variant="plain"
      data-testid={testId}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-control px-1 text-sm font-medium text-primary outline-none data-hovered:underline data-focus-visible:outline-2 data-focus-visible:outline-focus pointer-coarse:min-h-11"
    >
      <DirectionalIcon icon={ArrowLeft} className="size-4" />
      {children}
    </Link>
  );
}
