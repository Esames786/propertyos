import { BookOpen, CircleHelp, Compass, Keyboard, ListChecks } from 'lucide-react';
import { useState } from 'react';
import { Button as AriaButton, Menu, MenuItem, MenuTrigger, Popover, Text } from 'react-aria-components';
import { useT } from '../lib/useT';
import { useQueryParam } from '../navigation/RouterAdapter';
import { useNavigation } from '../navigation/RouterAdapter';
import { useGuidedTour } from '../onboarding/GuidedTourProvider';
import { Dialog } from '../overlays/Dialog';
import { popoverClass } from '../overlays/Menu';
import { cn } from '../lib/cn';

const itemClass =
  'flex cursor-default items-center gap-3 rounded-control px-3 py-2 text-sm text-text outline-none data-focused:bg-primary-soft pointer-coarse:py-3';

/** Help → Take a tour / Show me how / About this page / All tours / Shortcuts (doc 09 §2D). */
export function HelpMenu() {
  const { t } = useT();
  const tour = useGuidedTour();
  const { navigate } = useNavigation();
  const [, setHelp] = useQueryParam('help');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const essentials = tour.available.find((d) => d.id === tour.welcomeTourId) ?? tour.available.find((d) => d.id === 'GLOBAL-TOUR-001') ?? tour.available[0];

  return (
    <>
      <MenuTrigger>
        <AriaButton
          data-tour-id="global-help"
          aria-label={t('nav:header.help')}
          data-testid="help-button"
          className="grid size-10 place-items-center rounded-control text-muted data-hovered:bg-sunken data-hovered:text-text pointer-coarse:size-11"
        >
          <CircleHelp aria-hidden className="size-5" />
        </AriaButton>
        <Popover placement="bottom end" offset={6} className={cn(popoverClass, 'w-64')}>
          <Menu
            aria-label={t('nav:header.help')}
            className="outline-none"
            onAction={(key) => {
              if (key === 'about') setHelp('open', { replace: false });
              if (key === 'tour' && essentials) tour.start(essentials.id, { resume: tour.progressFor(essentials.id)?.status === 'paused' });
              if (key === 'text' && essentials) navigate(tour.links.textGuide(essentials.id));
              if (key === 'library') navigate(tour.links.library);
              if (key === 'shortcuts') setShortcutsOpen(true);
            }}
          >
            <MenuItem id="about" textValue={t('help:menu.aboutPage')} className={itemClass}>
              <BookOpen aria-hidden className="size-4" />
              <Text slot="label">{t('help:menu.aboutPage')}</Text>
            </MenuItem>
            {essentials && (
              <MenuItem id="tour" textValue={t('help:menu.takeTour')} className={itemClass} data-testid="help-take-tour">
                <Compass aria-hidden className="size-4" />
                <Text slot="label">{t('help:menu.takeTour')}</Text>
              </MenuItem>
            )}
            {essentials && (
              <MenuItem id="text" textValue={t('help:menu.showMeHow')} className={itemClass}>
                <ListChecks aria-hidden className="size-4" />
                <Text slot="label">{t('help:menu.showMeHow')}</Text>
              </MenuItem>
            )}
            <MenuItem id="library" textValue={t('help:menu.tourLibrary')} className={itemClass}>
              <Compass aria-hidden className="size-4" />
              <Text slot="label">{t('help:menu.tourLibrary')}</Text>
            </MenuItem>
            <MenuItem id="shortcuts" textValue={t('help:menu.shortcuts')} className={itemClass}>
              <Keyboard aria-hidden className="size-4" />
              <Text slot="label">{t('help:menu.shortcuts')}</Text>
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>
      <Dialog isOpen={shortcutsOpen} onOpenChange={setShortcutsOpen} title={t('help:shortcuts.title')} size="sm">
        <ShortcutList />
      </Dialog>
    </>
  );
}

export function ShortcutList() {
  const { t } = useT();
  const rows: Array<[string, string]> = [
    ['Ctrl K / ⌘ K', t('help:shortcuts.search')],
    ['Esc', t('help:shortcuts.close')],
    ['← →', t('help:shortcuts.tabs')],
    ['Tab', t('help:shortcuts.skip')],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
      {rows.map(([keys, label]) => (
        <div key={keys} className="contents">
          <dt>
            <kbd dir="ltr" className="ltr-ref rounded-sm border border-border-control bg-sunken px-2 py-0.5 text-xs">
              {keys}
            </kbd>
          </dt>
          <dd className="text-text">{label}</dd>
        </div>
      ))}
    </dl>
  );
}
