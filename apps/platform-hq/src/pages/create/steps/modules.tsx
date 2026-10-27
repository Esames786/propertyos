import type { DependencyCheckResult, EditionKey, LicensedSite, ModuleCatalog, ModuleCatalogEntry, ModuleCategory, ModuleKey, ModuleSelection } from '@repo/contracts';
import { Badge, Button, cn, InlineAlert, useSession, useT, useTransport } from '@repo/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Link2, Lock, MapPin, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { Checkbox, CheckboxGroup, Label, Switch } from 'react-aria-components';
import { moduleName } from '../../../lib/labels';
import { StepActions, StepFrame } from '../WizardChrome';

const CATEGORIES: ModuleCategory[] = ['foundation', 'community', 'finance', 'sales', 'property', 'people', 'channels'];

type Sites = 'all' | readonly string[];

/** Live dependency check on the mock platform server (A1 §6). */
function useDependencyCheck(modules: ModuleSelection[]) {
  const { transport } = useTransport();
  const { persona } = useSession();
  return useQuery<DependencyCheckResult>({
    queryKey: ['hq-deps', persona?.id, JSON.stringify(modules)],
    queryFn: ({ signal }) => transport.request<DependencyCheckResult>({ method: 'POST', path: '/platform/entitlements/check', body: { modules }, signal }),
    placeholderData: keepPreviousData,
  });
}

function applyFixes(selection: ModuleSelection[], fixes: ModuleSelection[]): ModuleSelection[] {
  const map = new Map<ModuleKey, Sites>(selection.map((s) => [s.module, s.sites]));
  for (const f of fixes) {
    const cur = map.get(f.module);
    map.set(f.module, cur === undefined ? f.sites : cur === 'all' || f.sites === 'all' ? 'all' : [...new Set([...cur, ...f.sites])]);
  }
  return [...map].map(([module, sites]) => ({ module, sites }));
}

/**
 * Step 4: modules and site-level entitlements. The edition preset is pre-selected (D-2: a preset,
 * not an access rule); every change is checked against the catalogue's hard requirements on the
 * server, with a one-click fix. Site-scoped modules can be limited to chosen sites.
 */
export function ModulesStep({
  value,
  edition,
  catalog,
  sites,
  onSubmit,
  autoFocus,
  onBack,
  pending,
}: {
  value: ModuleSelection[];
  edition: EditionKey;
  catalog: ModuleCatalog;
  sites: LicensedSite[];
  onSubmit: (m: ModuleSelection[]) => void;
  autoFocus: boolean;
  onBack: () => void;
  pending: boolean;
}) {
  const { t } = useT();
  const preset = catalog.presets.find((p) => p.key === edition)!;
  const [selection, setSelection] = useState<ModuleSelection[]>(() =>
    value.length ? value : (edition === 'custom' ? ['core' as ModuleKey] : preset.modules).map((module) => ({ module, sites: 'all' as const })),
  );
  const [showAll, setShowAll] = useState(false);
  const check = useDependencyCheck(selection);
  const result = check.data;
  const selected = new Map(selection.map((s) => [s.module, s.sites]));

  const toggle = (entry: ModuleCatalogEntry, on: boolean) =>
    setSelection((list) => (on ? [...list, { module: entry.key, sites: 'all' }] : list.filter((s) => s.module !== entry.key)));
  const setSites = (module: ModuleKey, s: Sites) => setSelection((list) => list.map((x) => (x.module === module ? { ...x, sites: s } : x)));

  const blocked = !result || !result.ok;
  // Modules that are neither in the edition nor a priced add-on stay folded away unless chosen.
  const typical = (m: ModuleCatalogEntry) => m.alwaysOn || m.includedIn.includes(edition) || m.addonFor.includes(edition) || selected.has(m.key);
  const hiddenCount = catalog.modules.filter((m) => !typical(m)).length;
  return (
    <StepFrame step="modules" title={t('platform:wizard.modules.title')} intro={t('platform:wizard.modules.intro')} autoFocus={autoFocus} testId="step-modules">
      <div className="mb-5" aria-live="polite" data-testid="dependency-result">
        {!result ? null : result.ok ? (
          <p className="flex items-center gap-2 text-sm font-medium text-success" data-testid="dependencies-ok">
            <CheckCircle2 aria-hidden className="size-5" />
            {t('platform:wizard.modules.ok', { count: selection.length })}
            {result.integrations.length > 0 && <span className="font-normal text-muted">· {t('platform:wizard.modules.integrations', { count: result.integrations.length })}</span>}
          </p>
        ) : (
          <InlineAlert tone="warning" title={t('platform:wizard.modules.issuesTitle', { count: result.issues.length })}>
            <ul className="list-disc space-y-1 ps-5" data-testid="dependency-issues">
              {result.issues.map((i) => (
                <li key={`${i.module}-${i.requires}`}>
                  {i.kind === 'missing'
                    ? t('platform:wizard.modules.missing', { module: moduleName(t, i.module), requires: moduleName(t, i.requires) })
                    : t('platform:wizard.modules.siteGap', {
                        module: moduleName(t, i.module),
                        requires: moduleName(t, i.requires),
                        sites: i.sites === 'all' ? t('platform:wizard.modules.allSites') : i.sites.map((id) => sites.find((s) => s.id === id)?.name ?? id).join(', '),
                      })}
                </li>
              ))}
            </ul>
            <Button variant="primary" icon={Wand2} className="mt-3" onPress={() => setSelection((s) => applyFixes(s, result.fixes))} data-testid="apply-fixes">
              {t('platform:wizard.modules.fix', { modules: result.fixes.map((f) => moduleName(t, f.module)).join(', ') })}
            </Button>
          </InlineAlert>
        )}
      </div>

      <div className="space-y-6">
        {CATEGORIES.map((cat) => {
          const entries = catalog.modules.filter((m) => m.category === cat && (showAll || typical(m)));
          if (entries.length === 0) return null;
          return (
            <section key={cat} aria-labelledby={`cat-${cat}`}>
              <h2 id={`cat-${cat}`} className="mb-2 text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                {t(`platform:moduleCategories.${cat}`)}
              </h2>
              <ul className="grid gap-2 lg:grid-cols-2">
                {entries.map((m) => {
                  const on = selected.has(m.key);
                  const included = m.includedIn.includes(edition);
                  const addon = m.addonFor.includes(edition);
                  const s = selected.get(m.key);
                  return (
                    <li key={m.key} className={cn('rounded-tile border p-3 transition-colors', on ? 'border-primary/40 bg-primary-soft/40' : 'border-border/70 bg-panel')} data-testid={`module-${m.key}`}>
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-text">{moduleName(t, m.key)}</p>
                          <p className="text-sm text-muted">{t(`platform:modules.${m.key}.description`)}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {m.alwaysOn ? (
                              <Badge tone="neutral" icon={Lock}>{t('platform:wizard.modules.alwaysOn')}</Badge>
                            ) : included ? (
                              <Badge tone="success">{t('platform:wizard.modules.included')}</Badge>
                            ) : addon ? (
                              <Badge tone="info">{t('platform:wizard.modules.addon')}</Badge>
                            ) : (
                              <Badge tone="neutral">{t('platform:wizard.modules.notTypical')}</Badge>
                            )}
                            {m.scope === 'site' && <Badge tone="neutral" icon={MapPin}>{t('platform:wizard.modules.siteScoped')}</Badge>}
                            {m.requires.filter((r) => r !== 'core').length > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted">
                                <Link2 aria-hidden className="size-3.5" />
                                {t('platform:wizard.modules.requires', { modules: m.requires.filter((r) => r !== 'core').map((r) => moduleName(t, r)).join(', ') })}
                              </span>
                            )}
                          </div>
                        </div>
                        <Switch
                          isSelected={on || m.alwaysOn}
                          isDisabled={m.alwaysOn}
                          onChange={(v) => toggle(m, v)}
                          aria-label={moduleName(t, m.key)}
                          data-testid={`toggle-${m.key}`}
                          className="group mt-1 shrink-0 cursor-default outline-none"
                        >
                          <span className="relative block h-6 w-11 rounded-pill border-2 border-border-control bg-sunken transition-colors group-data-selected:border-primary group-data-selected:bg-primary group-data-disabled:opacity-60 group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus">
                            <span className="absolute top-0.5 start-0.5 size-4 rounded-pill bg-panel shadow-card transition-transform group-data-selected:translate-x-5 rtl:group-data-selected:-translate-x-5" />
                          </span>
                        </Switch>
                      </div>
                      {on && m.scope === 'site' && sites.length > 1 && (
                        <CheckboxGroup
                          value={s === 'all' || s === undefined ? sites.map((x) => x.id) : [...s]}
                          onChange={(v) => setSites(m.key, v.length === sites.length ? 'all' : v)}
                          className="mt-3 border-t border-border/70 pt-3"
                          data-testid={`sites-${m.key}`}
                        >
                          <Label className="text-xs font-semibold text-text">{t('platform:wizard.modules.sitesFor', { module: moduleName(t, m.key) })}</Label>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
                            {sites.map((site) => (
                              <Checkbox key={site.id} value={site.id} className="group flex items-center gap-2 text-sm text-text outline-none">
                                <span className="grid size-5 place-items-center rounded-[0.3rem] border-2 border-border-control bg-panel group-data-selected:border-primary group-data-selected:bg-primary group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus">
                                  <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 fill-none stroke-on-primary stroke-[2.5] opacity-0 group-data-selected:opacity-100">
                                    <path d="M3 8.5 6.5 12 13 4.5" />
                                  </svg>
                                </span>
                                {site.name}
                              </Checkbox>
                            ))}
                          </div>
                        </CheckboxGroup>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {hiddenCount > 0 && (
        <Button variant="secondary" className="mt-5 max-w-full py-2 text-start whitespace-normal" onPress={() => setShowAll((v) => !v)} aria-expanded={showAll} data-testid="modules-show-all">
          {showAll ? t('platform:wizard.modules.hideOthers') : t('platform:wizard.modules.showOthers', { count: hiddenCount })}
        </Button>
      )}

      <StepActions
        testId="step-modules"
        onBack={onBack}
        pending={pending}
        nextDisabledReason={blocked ? t('platform:wizard.modules.blocked') : undefined}
        onNext={() => {
          if (!blocked) onSubmit(selection);
        }}
      />
    </StepFrame>
  );
}
