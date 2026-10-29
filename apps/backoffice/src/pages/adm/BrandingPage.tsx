import { ApiError, type OrgPaletteKey } from '@repo/contracts';
import { formatInstant, useLocale } from '@repo/i18n';
import { checkBrand, type BrandCheck } from '@repo/tokens/brand';
import {
  AppearancePreview,
  Badge,
  Button,
  ChoiceCards,
  InlineAlert,
  PageHeader,
  Panel,
  PALETTE_SWATCHES,
  PlainTextField,
  Skeleton,
  useAnnounce,
  useApiMutation,
  useDisplayPreferences,
  useOrgAppearanceSync,
  useSession,
  useT,
  useToast,
  type OrgAppearanceAnswer,
} from '@repo/ui';
import { Check, Lock, Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Preset = Exclude<OrgPaletteKey, 'brand'>;
const PRESETS: readonly Preset[] = ['evergreen', 'ocean', 'indigo', 'warm'];

/**
 * ADM-022 Organisation colours (Gate D.1). A preset palette for everyone in the organisation, shown
 * on this page at once (the page itself is the preview) and saved for everyone with one button. A
 * custom brand colour is checked against every contrast pair in light and dark mode before it can be
 * used, and saving it needs the White-label add-on. People's own palette and high contrast win.
 */
export default function BrandingPage() {
  const { t } = useT();
  const { locale } = useLocale();
  const { tenant } = useSession();
  const toast = useToast();
  const announce = useAnnounce();
  const display = useDisplayPreferences();
  const query = useOrgAppearanceSync();
  const save = useApiMutation<OrgAppearanceAnswer>();
  const saved = query.data;
  const [choice, setChoice] = useState<OrgPaletteKey | null>(null);
  const [hex, setHex] = useState('');
  const [check, setCheck] = useState<BrandCheck | null>(null);
  const current: OrgPaletteKey = choice ?? saved?.palette ?? 'evergreen';
  const { setOrganisation } = display;
  const savedRef = useRef(saved);
  savedRef.current = saved;

  // Instant preview: this page shows the candidate colours; leaving it restores what is saved.
  useEffect(() => {
    if (!choice) return;
    if (choice === 'brand') {
      if (check?.ok) setOrganisation({ palette: 'brand', brand: check.colours });
    } else setOrganisation({ palette: choice });
  }, [choice, check, setOrganisation]);
  useEffect(
    () => () => {
      const s = savedRef.current;
      setOrganisation(s?.chosen ? { palette: s.palette, ...(s.brand ? { brand: s.brand } : {}) } : null);
    },
    [setOrganisation],
  );

  const personal = display.prefs.palette !== 'organisation' || display.resolved.paletteOverridden;
  const dirty = !!choice && (choice !== saved?.palette || (choice === 'brand' && !!check?.ok));
  const lockedBrand = choice === 'brand' && !saved?.whiteLabel;

  const runCheck = (value = hex) => {
    const r = checkBrand(value.trim());
    setCheck(r);
    setChoice('brand');
    announce(r.ok ? t('identity:branding.pass') : t('identity:branding.fail'));
  };

  return (
    <div className="@container space-y-6">
      <PageHeader
        title={t('nav:pages.branding')}
        description={t('identity:branding.intro', { org: tenant.name })}
        actions={
          <Button
            variant="primary"
            icon={Check}
            isDisabled={!dirty || lockedBrand || (choice === 'brand' && !check?.ok)}
            isPending={save.isPending}
            onPress={() =>
              save.mutate(
                { method: 'PATCH', path: '/org/appearance', body: current === 'brand' ? { palette: 'brand', brandPrimary: hex.trim() } : { palette: current } },
                {
                  onSuccess: (r) => {
                    setChoice(null);
                    setOrganisation({ palette: r.palette, ...(r.brand ? { brand: r.brand } : {}) });
                    toast.success(t('identity:branding.saved', { org: tenant.name }));
                    announce(t('identity:branding.saved', { org: tenant.name }));
                  },
                  onError: (e) => toast.error(e instanceof ApiError ? t(e.problem.messageKey as 'identity:appearance.errors.contrast') : t('identity:export.failed')),
                },
              )
            }
            data-testid="branding-save"
          >
            {t('identity:branding.save')}
          </Button>
        }
      />
      {!saved ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-6 @5xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-6">
            <Panel title={t('identity:branding.presetsTitle')} description={saved.updatedByName && saved.updatedAt ? t('identity:branding.changedBy', { name: saved.updatedByName, date: formatInstant(saved.updatedAt, locale, 'dateTime') }) : t('identity:branding.neverChanged')}>
              <ChoiceCards<Preset>
                label={t('identity:branding.presetsTitle')}
                hideLabel
                value={(current === 'brand' ? '' : current) as Preset}
                onChange={(v) => {
                  setChoice(v);
                  setCheck(null);
                }}
                columns={2}
                testId="branding-palette"
                options={PRESETS.map((p) => ({
                  id: p,
                  label: t(`a11y:hub.palette.${p}.label`),
                  description: t(`a11y:hub.palette.${p}.description`),
                  visual: (
                    <span className="flex items-center gap-2">
                      <span className="size-8 rounded-pill border border-border" style={{ background: PALETTE_SWATCHES[p].light }} />
                      <span className="size-8 rounded-pill border border-border" style={{ background: PALETTE_SWATCHES[p].dark }} />
                      {saved.palette === p && saved.chosen && <Badge tone="success">{t('identity:branding.inUse')}</Badge>}
                    </span>
                  ),
                }))}
              />
              <p className="mt-4 text-sm text-muted">{t('identity:branding.overrideNote')}</p>
            </Panel>

            <Panel title={t('identity:branding.brandTitle')} description={t('identity:branding.brandIntro')}>
              <div className="space-y-4" data-testid="branding-brand">
                {!saved.whiteLabel && (
                  <InlineAlert tone="info" data-testid="branding-locked">
                    <span className="inline-flex items-start gap-1.5">
                      <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
                      {t('identity:branding.brandLocked')}
                    </span>
                  </InlineAlert>
                )}
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    runCheck();
                  }}
                >
                  <PlainTextField
                    className="min-w-0 flex-1 basis-[min(100%,14rem)]"
                    label={t('identity:branding.colour')}
                    description={t('identity:branding.colourHint')}
                    value={hex}
                    onChange={(v) => {
                      setHex(v);
                      setCheck(null);
                    }}
                    dir="ltr"
                    errorKey={check && !check.ok && check.failures[0] === 'not_a_colour' ? 'identity:branding.invalid' : undefined}
                    testId="branding-hex"
                  />
                  <Button type="submit" variant="secondary" icon={Palette} data-testid="branding-check">
                    {t('identity:branding.check')}
                  </Button>
                </form>
                {check?.ok && (
                  <InlineAlert tone="success" data-testid="branding-pass">
                    {t('identity:branding.pass')}
                  </InlineAlert>
                )}
                {check && !check.ok && check.failures[0] !== 'not_a_colour' && (
                  <InlineAlert tone="warning" title={t('identity:branding.fail')} data-testid="branding-fail">
                    <ul className="list-disc ps-5">
                      {check.failures.map((f) => (
                        <li key={f}>{t(`identity:branding.pair.${f}` as 'identity:branding.pair.not_a_colour')}</li>
                      ))}
                    </ul>
                    {check.suggestion && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span>{t('identity:branding.suggestion', { colour: check.suggestion })}</span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onPress={() => {
                            setHex(check.suggestion!);
                            runCheck(check.suggestion);
                          }}
                          data-testid="branding-use-suggestion"
                        >
                          {t('identity:branding.useSuggestion', { colour: check.suggestion })}
                        </Button>
                      </div>
                    )}
                  </InlineAlert>
                )}
              </div>
            </Panel>
          </div>
          <div className="min-w-0 space-y-3 @5xl:sticky @5xl:top-24 @5xl:self-start">
            {personal && <InlineAlert tone="info">{t('identity:branding.yourOverride')}</InlineAlert>}
            <AppearancePreview />
          </div>
        </div>
      )}
    </div>
  );
}
