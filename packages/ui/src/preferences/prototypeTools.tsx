import { useCallback, useSyncExternalStore } from 'react';
import { Switch } from '../forms/ChoiceFields';
import { readJson, writeJson } from '../lib/storage';
import { useT } from '../lib/useT';

export const PROTOTYPE_TOOLS_KEY = 'demo:prototype-tools';
const CHANGE = 'demo:prototype-tools-change';

const read = () => readJson<{ on: boolean }>(PROTOTYPE_TOOLS_KEY, { on: false }).on;
const subscribe = (notify: () => void) => {
  window.addEventListener(CHANGE, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(CHANGE, notify);
    window.removeEventListener('storage', notify);
  };
};

/**
 * Prototype tools (the design system lab) are not part of a client's workspace (owner, CP2 review):
 * they stay off the menus, search and demos unless switched on here. Their addresses keep working.
 */
export function usePrototypeTools(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((next: boolean) => {
    writeJson(PROTOTYPE_TOOLS_KEY, { on: next });
    window.dispatchEvent(new Event(CHANGE));
  }, []);
  return [on, set];
}

export function PrototypeToolsPreference() {
  const { t } = useT();
  const [on, set] = usePrototypeTools();
  return (
    <section aria-labelledby="pref-prototype" className="space-y-3">
      <h2 id="pref-prototype" className="text-base font-semibold text-text">
        {t('a11y:prototypeTools.title')}
      </h2>
      <Switch isSelected={on} onChange={set} label={t('a11y:prototypeTools.label')} description={t('a11y:prototypeTools.description')} testId="pref-prototype-tools" />
    </section>
  );
}
