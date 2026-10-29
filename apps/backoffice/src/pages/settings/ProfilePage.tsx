import { AppSwitchCard, DevicesPanel, Link, PageHeader, Panel, ProfileDetails, SecurityActivity, UrlTabs, useT } from '@repo/ui';
import { Accessibility, KeyRound } from 'lucide-react';
import { LINKS } from '../../nav.config';

/**
 * GLOBAL-008 Profile (Gate D.1): the person's details, contact and message consents, how they sign
 * in; Signed-in devices (GLOBAL-016) and Security activity as tabs; and the switch to the resident
 * app (GLOBAL-015) for people who are also residents. Appearance lives in its own hub (GLOBAL-010).
 */
export default function ProfilePage() {
  const { t } = useT();
  return (
    <div className="@container space-y-6">
      <PageHeader title={t('nav:pages.profile')} description={t('identity:profile.introStaff')} />
      <UrlTabs
        label={t('identity:profile.tabsLabel')}
        items={[
          { id: 'profile', label: t('identity:profile.tabs.profile') },
          { id: 'devices', label: t('identity:profile.tabs.devices') },
          { id: 'activity', label: t('identity:profile.tabs.activity') },
        ]}
      >
        {(tab) =>
          tab === 'devices' ? (
            <DevicesPanel />
          ) : tab === 'activity' ? (
            <SecurityActivity audience="staff" />
          ) : (
            <ProfileDetails
              aside={
                <>
                  <AppSwitchCard urlFor={LINKS.appSwitchUrl} />
                  <Panel>
                    <ul className="space-y-2 text-sm">
                      <li>
                        <Link href={LINKS.preferences} className="inline-flex min-h-9 items-center gap-2">
                          <Accessibility aria-hidden className="size-4" />
                          {t('identity:profile.links.appearance')}
                        </Link>
                      </li>
                      <li>
                        <Link href={LINKS.myAccess} className="inline-flex min-h-9 items-center gap-2">
                          <KeyRound aria-hidden className="size-4" />
                          {t('identity:profile.links.access')}
                        </Link>
                      </li>
                    </ul>
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
