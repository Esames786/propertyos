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
  'group flex h-full w-full flex-col items-center gap-2 rounded-card border border-border/70 bg-panel px-1 pt-3 pb-2.5 text-center shadow-card outline-none sm:gap-2.5 sm:px-2 sm:pt-4 sm:pb-3',
  'transition-[translate,box-shadow] duration-[var(--motion-regular)] ease-[var(--ease-emphasized)]',
  'data-hovered:-translate-y-1 data-hovered:shadow-lift data-pressed:translate-y-0 data-pressed:scale-[0.98]',
  'data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
);

/**
 * Quick actions: a row of solid colour tiles for the most common jobs on a screen. Every tile
 * leads somewhere real (a screen or a working drawer); actions the persona may not use are left
 * out. Phones show a four-column grid that wraps, so every action is visible at once (Gate A flaw
 * F-5: a sideways scroller hid tiles behind the edge); wider screens fill the row.
 */
export function QuickActions({ title, actions, tourId, testId = 'quick-actions' }: { title: string; actions: QuickAction[]; tourId?: string; testId?: string }) {
  const { can } = useSession();
  const visible = actions.filter((a) => !a.permission || can(a.permission));
  if (!visible.length) return null;
  return (
    <section aria-labelledby={`${testId}-title`} data-tour-id={tourId} data-testid={testId}>
      <SectionHeading id={`${testId}-title`} title={title} />
      <Stagger as="ul" className="grid grid-cols-4 gap-2 pt-1 pb-2 sm:grid-cols-[repeat(auto-fill,minmax(6.75rem,1fr))] sm:gap-3">
        {visible.map((a) => {
          const content = (
            <>
              <IconTile icon={a.icon} hue={a.hue} variant="solid" size="lg" className="transition-transform duration-[var(--motion-regular)] ease-[var(--ease-emphasized)] group-data-hovered:scale-105" />
              <span className="w-full text-[0.75rem] leading-snug font-medium [overflow-wrap:anywhere] text-text sm:text-[0.8125rem]">{a.label}</span>
            </>
          );
          return (
            <RevealItem as="li" key={a.id} className="min-w-0">
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
