import type { Permission } from '@repo/contracts';
import type { LucideIcon } from 'lucide-react';
import { Button as AriaButton, Link } from 'react-aria-components';
import { IconTile, type TileHue } from '../data/IconTile';
import { cn } from '../lib/cn';
import { useSession } from '../permissions/SessionProvider';
import { RevealItem, Stagger } from '../motion/Reveal';
import { SectionHeading } from './SectionHeading';

export interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  hue: TileHue;
  /** Navigate here … */
  href?: string;
  /** … or run this (open a drawer, start a flow). Exactly one of href/onPress. */
  onPress?: () => void;
  permission?: Permission;
  testId?: string;
}

const tileClass = cn(
  'group flex h-full w-full flex-col items-center gap-2.5 rounded-card border border-border/70 bg-panel px-2 pt-4 pb-3 text-center shadow-card outline-none',
  'transition-[translate,box-shadow] duration-[var(--motion-regular)] ease-[var(--ease-emphasized)]',
  'data-hovered:-translate-y-1 data-hovered:shadow-lift data-pressed:translate-y-0 data-pressed:scale-[0.98]',
  'data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
);

/**
 * Quick actions: a row of solid colour tiles for the most common jobs on a screen. Every tile
 * leads somewhere real (a screen or a working drawer); actions the persona may not use are left
 * out. Wraps to a grid on wide screens and scrolls sideways on phones, with the label always visible.
 */
export function QuickActions({ title, actions, tourId, testId = 'quick-actions' }: { title: string; actions: QuickAction[]; tourId?: string; testId?: string }) {
  const { can } = useSession();
  const visible = actions.filter((a) => !a.permission || can(a.permission));
  if (!visible.length) return null;
  return (
    <section aria-labelledby={`${testId}-title`} data-tour-id={tourId} data-testid={testId}>
      <SectionHeading id={`${testId}-title`} title={title} />
      <Stagger as="ul" className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pt-1 pb-2 scrollbar-none sm:grid sm:grid-cols-[repeat(auto-fill,minmax(6.75rem,1fr))] sm:overflow-visible">
        {visible.map((a) => {
          const content = (
            <>
              <IconTile icon={a.icon} hue={a.hue} variant="solid" size="lg" className="transition-transform duration-[var(--motion-regular)] ease-[var(--ease-emphasized)] group-data-hovered:scale-105" />
              <span className="text-[0.8125rem] leading-snug font-medium text-text">{a.label}</span>
            </>
          );
          return (
            <RevealItem as="li" key={a.id} className="w-[6.5rem] shrink-0 snap-start sm:w-auto">
              {a.href ? (
                <Link href={a.href} className={tileClass} data-testid={a.testId}>
                  {content}
                </Link>
              ) : (
                <AriaButton onPress={a.onPress} className={tileClass} data-testid={a.testId}>
                  {content}
                </AriaButton>
              )}
            </RevealItem>
          );
        })}
      </Stagger>
    </section>
  );
}
