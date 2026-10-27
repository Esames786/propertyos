import { EDITIONS, type ConfigPayload, type ConfigVersion, type EditionKey, type ModuleCatalogEntry, type ModuleKey } from '@repo/contracts';
import { Badge, ErrorState, PageHeader, Panel, SelectControl, Skeleton, UrlTabs, useQueryParam, useT } from '@repo/ui';
import { useState } from 'react';
import { CheckList } from '../../components/CheckList';
import { ConfigVersions, DraftEditor, InForce, NewVersionButton, useConfig } from '../../components/config';
import { editionName, moduleName } from '../../lib/labels';

type CataloguePayload = Extract<ConfigPayload, { kind: 'catalogue' }>;

/**
 * HQ-006 Module & feature catalogue and HQ-007 dependency matrix (Gate B remaining scope: catalogue
 * and dependency management). Which modules exist, how each is granted (whole organisation or per
 * site), what it requires and works with, and which editions include it. Changes are versions with
 * an effective date and a second person's approval; the dependency check of every grant, contract
 * and amendment uses the version in force.
 */
export default function CataloguePage() {
  const { t } = useT();
  const config = useConfig('catalogue');
  const [draftId, setDraftId] = useQueryParam('draft');
  if (config.isPending) return <Skeleton className="h-[32rem] rounded-card" />;
  if (config.isError) return <ErrorState error={config.error} onRetry={() => void config.refetch()} />;
  const o = config.data;
  const draft = o.versions.find((v) => v.id === draftId && (v.state === 'draft' || v.state === 'returned'));
  const modules = (o.current.payload as CataloguePayload).modules;
  return (
    <div className="@container space-y-6" data-testid="catalogue-page">
      <PageHeader
        title={t('platform:pages.catalogue')}
        description={t('platform:catalogue.intro')}
        actions={o.canManage && !draft ? <NewVersionButton kind="catalogue" onCreated={(id) => setDraftId(id, { replace: false })} /> : undefined}
      />
      <InForce version={o.current} />
      {draft ? (
        <DraftEditor version={draft as ConfigVersion & { payload: CataloguePayload }} onClose={() => setDraftId(null)}>
          {(payload, set) => <CatalogueEditor modules={payload.modules} onChange={(next) => set({ kind: 'catalogue', modules: next })} />}
        </DraftEditor>
      ) : (
        <UrlTabs
          label={t('platform:pages.catalogue')}
          items={[
            { id: 'modules', label: t('platform:catalogue.tabs.modules') },
            { id: 'dependencies', label: t('platform:catalogue.tabs.dependencies') },
            { id: 'versions', label: t('platform:catalogue.tabs.versions') },
          ]}
        >
          {(tab) => (
            <div className="pt-6" data-testid={`catalogue-tab-${tab}`}>
              {tab === 'modules' && <ModulesTable modules={modules} />}
              {tab === 'dependencies' && <Dependencies modules={modules} />}
              {tab === 'versions' && <ConfigVersions overview={o} onEdit={(id) => setDraftId(id, { replace: false })} />}
            </div>
          )}
        </UrlTabs>
      )}
      {draft && <ConfigVersions overview={o} onEdit={(id) => setDraftId(id, { replace: false })} />}
    </div>
  );
}

function ModulesTable({ modules }: { modules: readonly ModuleCatalogEntry[] }) {
  const { t } = useT();
  return (
    <Panel title={t('platform:catalogue.modulesTitle', { count: modules.length })} description={t('platform:catalogue.modulesHint')}>
      <div className="overflow-x-auto" role="region" aria-label={t('platform:catalogue.modulesTitle', { count: modules.length })} tabIndex={0}>
        <table className="w-full min-w-[46rem] text-sm" data-testid="catalogue-modules">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:t360.module')}</th>
              <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:catalogue.scope')}</th>
              <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:t360.requires')}</th>
              <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:catalogue.included')}</th>
              <th scope="col" className="py-2 text-start font-medium">{t('platform:catalogue.addon')}</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m.key} className="border-b border-border/60 last:border-0 align-top" data-testid={`catalogue-module-${m.key}`}>
                <th scope="row" className="py-2.5 pe-3 text-start">
                  <span className="font-medium text-text">{moduleName(t, m.key)}</span>
                  <span className="block text-xs font-normal text-muted">{t(`platform:moduleCategories.${m.category}`)}</span>
                </th>
                <td className="py-2.5 pe-3">
                  <Badge tone={m.scope === 'site' ? 'info' : 'neutral'}>{t(`platform:catalogue.scopes.${m.scope}`)}</Badge>
                </td>
                <td className="py-2.5 pe-3 text-muted">{m.requires.length ? m.requires.map((r) => moduleName(t, r)).join(', ') : '—'}</td>
                <td className="py-2.5 pe-3 text-muted">{m.alwaysOn ? t('platform:catalogue.always') : m.includedIn.length ? m.includedIn.map((e) => editionName(t, e)).join(', ') : '—'}</td>
                <td className="py-2.5 text-muted">{m.addonFor.length ? m.addonFor.map((e) => editionName(t, e)).join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** HQ-007 as a list: each module's requirements, who requires it, and what it works with. */
function Dependencies({ modules }: { modules: readonly ModuleCatalogEntry[] }) {
  const { t } = useT();
  const requiredBy = (k: ModuleKey) => modules.filter((m) => m.requires.includes(k)).map((m) => m.key);
  return (
    <Panel title={t('platform:catalogue.dependenciesTitle')} description={t('platform:catalogue.dependenciesHint')}>
      <div className="overflow-x-auto" role="region" aria-label={t('platform:catalogue.dependenciesTitle')} tabIndex={0}>
        <table className="w-full min-w-[40rem] text-sm" data-testid="catalogue-dependencies">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:t360.module')}</th>
              <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:t360.requires')}</th>
              <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:catalogue.requiredBy')}</th>
              <th scope="col" className="py-2 text-start font-medium">{t('platform:catalogue.integrates')}</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m.key} className="border-b border-border/60 last:border-0 align-top" data-testid={`dependency-${m.key}`}>
                <th scope="row" className="py-2.5 pe-3 text-start font-medium text-text">{moduleName(t, m.key)}</th>
                <td className="py-2.5 pe-3">{m.requires.length ? m.requires.map((r) => moduleName(t, r)).join(', ') : <span className="text-muted">—</span>}</td>
                <td className="py-2.5 pe-3 text-muted">{requiredBy(m.key).map((r) => moduleName(t, r)).join(', ') || '—'}</td>
                <td className="py-2.5 text-muted">{m.integrates.map((r) => moduleName(t, r)).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** Edit one module at a time: what it requires and which editions include it or may add it. */
function CatalogueEditor({ modules, onChange }: { modules: readonly ModuleCatalogEntry[]; onChange: (next: ModuleCatalogEntry[]) => void }) {
  const { t } = useT();
  const [key, setKey] = useState<ModuleKey>(modules.find((m) => !m.alwaysOn)!.key);
  const m = modules.find((x) => x.key === key)!;
  const update = (patch: Partial<ModuleCatalogEntry>) => onChange(modules.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const editions = EDITIONS.map((e) => ({ id: e, label: editionName(t, e) }));
  return (
    <div className="space-y-5" data-testid="catalogue-editor">
      <SelectControl label={t('platform:catalogue.editModule')} value={key} options={modules.filter((x) => !x.alwaysOn).map((x) => ({ id: x.key, label: moduleName(t, x.key) }))} onChange={(v) => v && setKey(v as ModuleKey)} testId="catalogue-editor-module" />
      <p className="text-sm text-muted">{t('platform:catalogue.editHint', { scope: t(`platform:catalogue.scopes.${m.scope}`) })}</p>
      <CheckList
        label={t('platform:t360.requires')}
        description={t('platform:catalogue.requiresHint')}
        options={modules.filter((x) => x.key !== key && !x.alwaysOn).map((x) => ({ id: x.key, label: moduleName(t, x.key), ...(x.scope === 'site' ? { hint: t('platform:catalogue.scopes.site') } : {}) }))}
        value={m.requires.filter((r) => r !== 'core')}
        onChange={(next) => update({ requires: [...(m.requires.includes('core') ? ['core' as const] : []), ...(next as ModuleKey[])] })}
        className="@xl:grid-cols-2 @4xl:grid-cols-3"
        testId="catalogue-requires"
      />
      <div className="grid gap-5 @2xl:grid-cols-2">
        <CheckList label={t('platform:catalogue.included')} options={editions} value={m.includedIn} onChange={(next) => update({ includedIn: next as EditionKey[] })} testId="catalogue-included" />
        <CheckList label={t('platform:catalogue.addon')} options={editions} value={m.addonFor} onChange={(next) => update({ addonFor: next as EditionKey[] })} testId="catalogue-addon" />
      </div>
    </div>
  );
}
