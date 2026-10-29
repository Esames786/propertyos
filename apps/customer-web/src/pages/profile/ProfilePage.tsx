import { AppSwitchCard, DevicesPanel, Link, Panel, ProfileDetails, SecurityActivity, UrlTabs, useT } from '@repo/ui';
import { Accessibility } from 'lucide-react';
import { PORTAL, switchToOfficeUrl } from '../../nav.config';
import { MyDataPanel } from './MyDataPanel';

/**
 * PORTAL-024 Profile (Gate D.1): contact details and message consents; Signed-in devices
 * (PORTAL-041) with recent security activity; My data (a copy, corrections, deletion requests); and,
 * for a resident who also works for the society, the switch to the office app (GLOBAL-015).
 */
export default function ProfilePage() {
  const { t } = useT();
  return (
    <div className="@container space-y-6">
      <div className="space-y-1">
        <h1 id="page-title" tabIndex={-1} className="text-figure-sm font-bold tracking-tight text-text outline-none">
          {t('nav:pages.profile')}
        </h1>
        <p className="text-muted">{t('identity:profile.introResident')}</p>
      </div>
      <UrlTabs
        label={t('identity:profile.tabsLabel')}
        items={[
          { id: 'profile', label: t('identity:profile.tabs.profile') },
          { id: 'devices', label: t('identity:profile.tabs.devices') },
          { id: 'data', label: t('identity:profile.tabs.data') },
        ]}
      >
        {(tab) =>
          tab === 'devices' ? (
            <div className="space-y-6">
              <DevicesPanel />
              <SecurityActivity audience="resident" />
            </div>
          ) : tab === 'data' ? (
            <MyDataPanel />
          ) : (
            <ProfileDetails
              aside={
                <>
                  <AppSwitchCard urlFor={switchToOfficeUrl} />
                  <Panel>
                    <Link href={PORTAL.accessibility} className="inline-flex min-h-9 items-center gap-2 text-sm">
                      <Accessibility aria-hidden className="size-4" />
                      {t('identity:profile.links.appearance')}
                    </Link>
                  </Panel>
                </>
              }
            />
          )
        }
      </UrlTabs>
    </div>
  );
}
