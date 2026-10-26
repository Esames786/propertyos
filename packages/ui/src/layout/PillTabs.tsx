import { motion } from 'motion/react';
import { useId, useState, type ReactNode } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { cn } from '../lib/cn';
import { useReducedMotion } from '../preferences/PreferencesProvider';

export interface PillTab {
  id: string;
  label: string;
  /** Optional count shown in the tab (also part of its name). */
  count?: number;
}

/**
 * In-card tabs (state kept locally; use UrlTabs for workspace tabs that must deep-link).
 * The selected pill slides between tabs; arrow keys follow reading direction (React Aria).
 */
export function PillTabs({
  label,
  tabs,
  children,
  defaultSelected,
  testId,
}: {
  label: string;
  tabs: PillTab[];
  children: (id: string) => ReactNode;
  defaultSelected?: string;
  testId?: string;
}) {
  const reduced = useReducedMotion();
  const layoutId = useId();
  const [selected, setSelected] = useState(defaultSelected ?? tabs[0]?.id ?? '');
  const current = tabs.some((t) => t.id === selected) ? selected : (tabs[0]?.id ?? '');
  return (
    <Tabs selectedKey={current} onSelectionChange={(k) => setSelected(String(k))} data-testid={testId}>
      <TabList aria-label={label} className="flex gap-1 overflow-x-auto rounded-pill bg-sunken p-1 scrollbar-none">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            id={tab.id}
            className={cn(
              'relative flex min-h-8 flex-1 shrink-0 cursor-default items-center justify-center gap-1.5 rounded-pill px-2.5 text-sm whitespace-nowrap text-muted outline-none pointer-coarse:min-h-10',
              'data-hovered:text-text data-selected:font-medium data-selected:text-text',
              'data-focus-visible:outline-2 data-focus-visible:outline-offset-1 data-focus-visible:outline-focus',
            )}
          >
            {({ isSelected }) => (
              <>
                {isSelected && (
                  <motion.span
                    layoutId={layoutId}
                    transition={reduced ? { duration: 0 } : { type: 'spring', bounce: 0.18, duration: 0.45 }}
                    className="absolute inset-0 rounded-pill bg-panel shadow-card"
                  />
                )}
                <span className="relative">{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={cn('relative min-w-5 rounded-pill px-1.5 text-center text-xs tabular', isSelected ? 'bg-primary text-on-primary' : 'bg-panel text-muted')}>
                    <bdi dir="ltr">{tab.count}</bdi>
                  </span>
                )}
              </>
            )}
          </Tab>
        ))}
      </TabList>
      <TabPanel key={current} id={current} className="mt-4 outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus">
        {children(current)}
      </TabPanel>
    </Tabs>
  );
}
