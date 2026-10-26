import type { ReactElement } from 'react';
import { Tooltip as AriaTooltip, TooltipTrigger } from 'react-aria-components';

/**
 * Tooltip on hover and keyboard focus. It repeats a visible or accessible label; it is never the
 * only place important information lives (it is unavailable on touch).
 */
export function Tooltip({ content, children, placement = 'bottom' }: { content: string; children: ReactElement; placement?: 'top' | 'bottom' | 'start' | 'end' }) {
  return (
    <TooltipTrigger delay={500} closeDelay={100}>
      {children}
      <AriaTooltip
        placement={placement}
        offset={6}
        className="max-w-xs rounded-sm bg-text px-2.5 py-1.5 text-xs text-inverse shadow-overlay data-entering:animate-overlay-in data-exiting:animate-overlay-out"
      >
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
