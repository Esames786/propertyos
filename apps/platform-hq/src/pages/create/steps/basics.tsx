import { EDITIONS, type EditionKey, type LicensedSite, type ModuleCatalog, type TenantOrganisation } from '@repo/contracts';
import { isValidPkPhone } from '@repo/i18n';
import { Button, cn, IconButton, IconTile, InlineAlert, SegmentedControl, SelectControl, useT } from '@repo/ui';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Label, Radio, RadioGroup } from 'react-aria-components';
import { CountInput, TextInput } from '../../../components/inputs';
import { EDITION_HUE, EDITION_ICON, editionName } from '../../../lib/labels';
import { StepActions, StepFrame } from '../WizardChrome';

export const CITIES = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Sialkot', 'Quetta', 'Hyderabad'] as const;

interface StepProps {
  autoFocus: boolean;
  onBack?: () => void;
  pending: boolean;
}

/** Error summary that takes focus after a failed Continue (fields keep their own messages). */
function ErrorSummary({ errors, attempt }: { errors: string[]; attempt: number }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (attempt > 0 && errors.length) ref.current?.focus();
  }, [attempt, errors.length]);
  if (attempt === 0 || errors.length === 0) return null;
  return (
    <div ref={ref} tabIndex={-1} className="mb-5 outline-none" data-testid="wizard-errors">
      <InlineAlert tone="error" title={t('platform:wizard.errors.title', { count: errors.length })} role="alert">
        <ul className="list-disc ps-5">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </InlineAlert>
    </div>
  );
}

// ---------------------------------------------------------------- 1. Type & edition

export function TypeStep({ value, catalog, onSubmit, ...p }: StepProps & { value: EditionKey | null; catalog: ModuleCatalog; onSubmit: (e: EditionKey) => void }) {
  const { t } = useT();
  const [edition, setEdition] = useState<EditionKey | null>(value);
  const [attempt, setAttempt] = useState(0);
  return (
    <StepFrame step="type" title={t('platform:wizard.type.title')} intro={t('platform:wizard.type.intro')} autoFocus={p.autoFocus} testId="step-type">
      <ErrorSummary errors={edition ? [] : [t('platform:wizard.type.required')]} attempt={attempt} />
      <RadioGroup value={edition} onChange={(v) => setEdition(v as EditionKey)} aria-label={t('platform:wizard.type.label')} className="grid gap-3 md:grid-cols-2" data-testid="edition-options" data-tour-id="edition-options">
        <Label className="sr-only">{t('platform:wizard.type.label')}</Label>
        {EDITIONS.map((e) => {
          const preset = catalog.presets.find((x) => x.key === e)!;
          return (
            <Radio
              key={e}
              value={e}
              data-testid={`edition-${e}`}
              className={cn(
                'group relative flex cursor-pointer gap-4 rounded-card border border-border bg-panel p-4 shadow-card outline-none transition-[border-color,box-shadow,translate] duration-[var(--motion-fast)]',
                'data-hovered:-translate-y-0.5 data-hovered:shadow-lift data-selected:border-primary data-selected:ring-2 data-selected:ring-primary/30',
                'data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
              )}
            >
              <IconTile icon={EDITION_ICON[e]} hue={EDITION_HUE[e]} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-base font-bold text-text">{editionName(t, e)}</span>
                  <CheckCircle2 aria-hidden className="size-5 text-primary opacity-0 transition-opacity group-data-selected:opacity-100" />
                </span>
                <span className="mt-1 block text-sm text-muted">{t(`platform:editions.${e}.description`)}</span>
                <span className="mt-2 block text-xs font-medium text-text">
                  {e === 'custom' ? t('platform:wizard.type.customModules') : t('platform:wizard.type.modules', { count: preset.modules.length })}
                </span>
              </span>
            </Radio>
          );
        })}
      </RadioGroup>
      <p className="mt-4 text-sm text-muted">{t('platform:wizard.type.presetNote')}</p>
      <StepActions
        testId="step-type"
        pending={p.pending}
        onNext={() => {
          setAttempt((a) => a + 1);
          if (edition) onSubmit(edition);
        }}
      />
    </StepFrame>
  );
}

// ---------------------------------------------------------------- 2. Organisation

const EMPTY_ORG: TenantOrganisation = {
  displayName: '',
  legalName: '',
  city: 'Lahore',
  timezone: 'Asia/Karachi',
  currency: 'PKR',
  language: 'en-PK',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OrganisationStep({ value, onSubmit, ...p }: StepProps & { value: TenantOrganisation | null; onSubmit: (o: TenantOrganisation) => void }) {
  const { t } = useT();
  const [org, setOrg] = useState<TenantOrganisation>(value ?? EMPTY_ORG);
  const [attempt, setAttempt] = useState(0);
  const set = (patch: Partial<TenantOrganisation>) => setOrg((o) => ({ ...o, ...patch }));
  const err = {
    displayName: !org.displayName.trim() ? t('platform:wizard.org.errors.displayName') : '',
    legalName: !org.legalName.trim() ? t('platform:wizard.org.errors.legalName') : '',
    contactName: !org.contactName.trim() ? t('platform:wizard.org.errors.contactName') : '',
    contactEmail: !EMAIL.test(org.contactEmail.trim()) ? t('platform:wizard.org.errors.contactEmail') : '',
    contactPhone: !isValidPkPhone(org.contactPhone) ? t('platform:wizard.org.errors.contactPhone') : '',
  };
  const errors = Object.values(err).filter(Boolean);
  const show = attempt > 0;
  return (
    <StepFrame step="organisation" title={t('platform:wizard.org.title')} intro={t('platform:wizard.org.intro')} autoFocus={p.autoFocus} testId="step-organisation">
      <ErrorSummary errors={errors} attempt={attempt} />
      <div className="grid gap-4 md:grid-cols-2">
        <TextInput label={t('platform:wizard.org.displayName')} description={t('platform:wizard.org.displayNameHint')} value={org.displayName} onChange={(v) => set({ displayName: v })} isInvalid={show && !!err.displayName} errorMessage={err.displayName} testId="org-display" />
        <TextInput label={t('platform:wizard.org.legalName')} value={org.legalName} onChange={(v) => set({ legalName: v })} isInvalid={show && !!err.legalName} errorMessage={err.legalName} testId="org-legal" />
        <SelectControl label={t('platform:wizard.org.city')} value={org.city} options={CITIES.map((c) => ({ id: c, label: c }))} onChange={(v) => v && set({ city: v })} testId="org-city" />
        <SegmentedControl
          label={t('platform:wizard.org.language')}
          value={org.language}
          options={[
            { id: 'en-PK', label: 'English' },
            { id: 'ur-PK', label: 'اردو' },
          ]}
          onChange={(v) => set({ language: v })}
          testId="org-language"
        />
        <TextInput label={t('platform:wizard.org.contactName')} value={org.contactName} onChange={(v) => set({ contactName: v })} isInvalid={show && !!err.contactName} errorMessage={err.contactName} autoComplete="off" testId="org-contact" />
        <TextInput label={t('platform:wizard.org.contactEmail')} type="email" value={org.contactEmail} onChange={(v) => set({ contactEmail: v })} isInvalid={show && !!err.contactEmail} errorMessage={err.contactEmail} autoComplete="off" testId="org-email" />
        <TextInput
          label={t('platform:wizard.org.contactPhone')}
          type="tel"
          description={t('platform:wizard.org.phoneHint')}
          value={org.contactPhone}
          onChange={(v) => set({ contactPhone: v })}
          isInvalid={show && !!err.contactPhone}
          errorMessage={err.contactPhone}
          autoComplete="off"
          testId="org-phone"
        />
      </div>
      <p className="mt-4 text-sm text-muted">{t('platform:wizard.org.fictional')}</p>
      <StepActions
        testId="step-organisation"
        onBack={p.onBack}
        pending={p.pending}
        onNext={() => {
          setAttempt((a) => a + 1);
          if (errors.length === 0) onSubmit({ ...org, displayName: org.displayName.trim(), legalName: org.legalName.trim() });
        }}
      />
    </StepFrame>
  );
}

// ---------------------------------------------------------------- 3. Sites

const KINDS: LicensedSite['kind'][] = ['residential', 'mixed', 'commercial', 'plots'];
let siteSeq = 0;
const newSite = (name: string, city: string): LicensedSite => ({ id: `site_${Date.now().toString(36)}${(siteSeq++).toString(36)}`, name, city, kind: 'residential', buildings: 1, declaredUnits: 0 });

export function SitesStep({ value, organisation, onSubmit, ...p }: StepProps & { value: LicensedSite[]; organisation: TenantOrganisation | null; onSubmit: (s: LicensedSite[]) => void }) {
  const { t } = useT();
  const [sites, setSites] = useState<LicensedSite[]>(() => (value.length ? value : [newSite((organisation?.displayName ?? '').replace(/\s*\(demo\)\s*$/i, ''), organisation?.city ?? 'Lahore')]));
  const [attempt, setAttempt] = useState(0);
  const set = (id: string, patch: Partial<LicensedSite>) => setSites((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const errors = [
    ...(sites.length === 0 ? [t('platform:wizard.sites.errors.none')] : []),
    ...sites.flatMap((s, i) => [
      ...(!s.name.trim() ? [t('platform:wizard.sites.errors.name', { n: i + 1 })] : []),
      ...(s.declaredUnits <= 0 ? [t('platform:wizard.sites.errors.units', { n: i + 1 })] : []),
    ]),
  ];
  const show = attempt > 0;
  const total = sites.reduce((n, s) => n + s.declaredUnits, 0);
  return (
    <StepFrame step="sites" title={t('platform:wizard.sites.title')} intro={t('platform:wizard.sites.intro')} autoFocus={p.autoFocus} testId="step-sites">
      <ErrorSummary errors={errors} attempt={attempt} />
      <ul className="space-y-3">
        {sites.map((s, i) => (
          <li key={s.id} className="rounded-tile border border-border/70 p-4" data-testid={`site-${i}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-text">{t('platform:wizard.sites.siteN', { n: i + 1 })}</h2>
              {sites.length > 1 && <IconButton label={t('platform:wizard.sites.remove', { n: i + 1 })} icon={Trash2} onPress={() => setSites((l) => l.filter((x) => x.id !== s.id))} />}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <TextInput className="xl:col-span-2" label={t('platform:wizard.sites.name')} value={s.name} onChange={(v) => set(s.id, { name: v })} isInvalid={show && !s.name.trim()} errorMessage={t('platform:wizard.sites.errors.nameField')} testId={`site-name-${i}`} />
              <SelectControl label={t('platform:wizard.org.city')} value={s.city} options={CITIES.map((c) => ({ id: c, label: c }))} onChange={(v) => v && set(s.id, { city: v })} testId={`site-city-${i}`} />
              <SelectControl label={t('platform:wizard.sites.kind')} value={s.kind} options={KINDS.map((k) => ({ id: k, label: t(`platform:siteKinds.${k}`) }))} onChange={(v) => v && set(s.id, { kind: v as LicensedSite['kind'] })} testId={`site-kind-${i}`} />
              <CountInput label={t('platform:wizard.sites.buildings')} value={s.buildings} min={0} max={500} onChange={(n) => set(s.id, { buildings: n })} testId={`site-buildings-${i}`} />
              <CountInput
                className="sm:col-span-2 xl:col-span-2"
                label={t('platform:wizard.sites.units')}
                description={t('platform:wizard.sites.unitsHint')}
                value={s.declaredUnits}
                min={0}
                max={100000}
                onChange={(n) => set(s.id, { declaredUnits: n })}
                isInvalid={show && s.declaredUnits <= 0}
                errorMessage={t('platform:wizard.sites.errors.unitsField')}
                testId={`site-units-${i}`}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" icon={Plus} onPress={() => setSites((l) => [...l, newSite('', organisation?.city ?? 'Lahore')])} data-testid="add-site">
          {t('platform:wizard.sites.add')}
        </Button>
        <p className="text-sm text-muted" aria-live="polite">
          {t('platform:wizard.sites.total', { count: sites.length, units: total })}
        </p>
      </div>
      <StepActions
        testId="step-sites"
        onBack={p.onBack}
        pending={p.pending}
        onNext={() => {
          setAttempt((a) => a + 1);
          if (errors.length === 0) onSubmit(sites.map((s) => ({ ...s, name: s.name.trim() })));
        }}
      />
    </StepFrame>
  );
}
