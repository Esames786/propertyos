import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button as AriaButton, Tab, TabList, TabPanel, Tabs as AriaTabs } from 'react-aria-components';
import { cn } from '../lib/cn';
import { useIsDesktop, useIsTabletUp } from '../lib/useMediaQuery';
import { useT } from '../lib/useT';
import { useQueryParam } from '../navigation/RouterAdapter';
import { MenuButton } from '../overlays/Menu';

export interface TabItem {
  id: string;
  label: string;
}

/**
 * Workspace tabs synced to the URL (`?tab=`), so every tab is deep-linkable.
 * Desktop shows a row + "More"; tablet and phone show fewer tabs + "More", never 16 tiny labels.
 * Arrow keys follow reading direction (React Aria handles RTL).
 */
export function UrlTabs({
  label,
  items,
  param = 'tab',
  defaultId,
  children,
}: {
  label: string;
  items: TabItem[];
  param?: string;
  /** Tab shown when the URL has no tab parameter (e.g. a route that deep-links to one tab). */
  defaultId?: string;
  children: (selectedId: string) => ReactNode;
}) {
  const { t } = useT();
  const [raw, setTab] = useQueryParam(param);
  const isDesktop = useIsDesktop();
  const isTablet = useIsTabletUp();
  const fallback = defaultId && items.some((i) => i.id === defaultId) ? defaultId : items[0]!.id;
  const selected = items.some((i) => i.id === raw) ? raw! : fallback;

  const limit = isDesktop ? 7 : isTablet ? 5 : 3;
  let visible = items.slice(0, limit);
  if (items.length > limit && !visible.some((i) => i.id === selected)) {
    visible = [...items.slice(0, limit - 1), items.find((i) => i.id === selected)!];
  }
  const overflow = items.filter((i) => !visible.includes(i));

  return (
    <AriaTabs selectedKey={selected} onSelectionChange={(key) => setTab(String(key) === fallback ? null : String(key))}>
      <div className="flex items-end gap-1 border-b border-border">
        <TabList aria-label={label} className="flex min-w-0 gap-1 overflow-x-auto">
          {visible.map((item) => (
            <Tab
              key={item.id}
              id={item.id}
              className={cn(
                'relative cursor-default rounded-t-control px-3 py-2.5 text-sm whitespace-nowrap text-muted outline-none',
                'data-hovered:text-text data-selected:font-semibold data-selected:text-primary pointer-coarse:py-3',
                'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-pill data-selected:after:bg-primary',
                'data-focus-visible:outline-2 data-focus-visible:outline-focus',
              )}
            >
              {item.label}
            </Tab>
          ))}
        </TabList>
        {overflow.length > 0 && (
          <MenuButton
            label={t('common:actions.more')}
            placement="bottom end"
            onAction={(id) => setTab(id)}
            groups={[{ id: 'more', items: overflow.map((i) => ({ id: i.id, label: i.label })) }]}
            trigger={
              <AriaButton className="mb-0.5 inline-flex items-center gap-1 rounded-control px-3 py-2 text-sm text-muted data-hovered:bg-sunken data-hovered:text-text pointer-coarse:py-3">
                {t('common:actions.more')}
                <span className="sr-only">({overflow.length})</span>
                <ChevronDown aria-hidden className="size-4" />
              </AriaButton>
            }
          />
        )}
      </div>
      <TabPanel id={selected} className="pt-5 outline-none">
        {children(selected)}
      </TabPanel>
    </AriaTabs>
  );
}
