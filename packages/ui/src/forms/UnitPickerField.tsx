import type { Floor, Project, Tower, Unit } from '@repo/contracts';
import { formatArea, formatMoney, useLocale } from '@repo/i18n';
import { useController } from 'react-hook-form';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { useApiQuery } from '../data/TransportProvider';
import { useT } from '../lib/useT';
import { SelectControl, type Option } from './ChoiceFields';
import { StandaloneError } from './FieldParts';
import { useFieldMeta } from './Form';

export interface UnitSelection {
  projectId?: string;
  towerId?: string;
  floorId?: string;
  block?: string;
  unitId?: string;
  unitRef?: string;
}

/**
 * Dependent project → tower → floor → unit picker (plots: project → phase → plot).
 * Each level explains why it is disabled, clearing a parent clears and announces its children,
 * and unavailable units stay visible with their status but cannot be chosen.
 */
export function UnitPickerField({ name, label, description }: { name: string; label: string; description?: string }) {
  const { t } = useT();
  const { locale } = useLocale();
  const announce = useAnnounce();
  const { id } = useFieldMeta(name, label);
  const { field, fieldState } = useController({ name });
  const value: UnitSelection = field.value ?? {};

  const projects = useApiQuery<Project[]>({ method: 'GET', path: '/projects' });
  const project = projects.data?.find((p) => p.id === value.projectId);
  const isPlots = project?.kind === 'plots';
  const towers = useApiQuery<Tower[]>(project && !isPlots ? { method: 'GET', path: `/projects/${project.id}/towers` } : null);
  const blocks = useApiQuery<string[]>(project && isPlots ? { method: 'GET', path: `/projects/${project.id}/blocks` } : null);
  const floors = useApiQuery<Floor[]>(value.towerId ? { method: 'GET', path: `/towers/${value.towerId}/floors` } : null);
  const units = useApiQuery<Unit[]>(
    value.floorId
      ? { method: 'GET', path: '/units', query: { floorId: value.floorId } }
      : isPlots && value.block
        ? { method: 'GET', path: '/units', query: { projectId: project!.id, block: value.block } }
        : null,
  );

  const set = (next: UnitSelection, cleared: string[], parent: string) => {
    field.onChange(next);
    if (cleared.length) announce(t('forms:unitPicker.childCleared', { field: cleared.join(', '), parent }));
  };

  const projectOptions: Option[] = (projects.data ?? []).map((p) => ({ id: p.id, label: `${p.name} · ${p.city}` }));
  const towerOptions: Option[] = (towers.data ?? []).map((tw) => ({ id: tw.id, label: `${t('forms:fields.tower')} ${tw.name}` }));
  const floorOptions: Option[] = (floors.data ?? []).map((f) => ({ id: f.id, label: t('forms:unitPicker.floorLabel', { level: String(f.level) }) }));
  const blockOptions: Option[] = (blocks.data ?? []).map((b) => ({ id: b, label: b }));
  const unitOptions: Option[] = (units.data ?? []).map((u) => ({
    id: u.id,
    label: t('forms:unitPicker.unitOption', {
      ref: u.ref,
      type: t(`common:unitType.${u.type}`),
      area: formatArea(u.areaSqft, locale),
      price: formatMoney(u.price, locale),
    }),
    description: t(`status:unit.${u.status}`),
    isDisabled: u.status !== 'available',
  }));

  const childLabels = {
    tower: t('forms:fields.tower'),
    floor: t('forms:fields.floor'),
    block: t('forms:fields.block'),
    unit: t('forms:fields.unit'),
  };
  const errorId = `${id}-error`;

  return (
    <fieldset id={id} aria-describedby={fieldState.error ? errorId : undefined} className="space-y-4 rounded-card border border-border p-4" data-testid="unit-picker">
      <legend className="px-1 text-sm font-semibold text-text">{label}</legend>
      {description && <p className="-mt-2 text-xs text-muted">{description}</p>}
      <div className="grid gap-4 @md:grid-cols-2">
        <SelectControl
          label={t('forms:fields.project')}
          options={projectOptions}
          value={value.projectId ?? null}
          isInvalid={!!fieldState.error && !value.projectId}
          onChange={(projectId) => {
            const cleared = [value.towerId && childLabels.tower, value.floorId && childLabels.floor, value.block && childLabels.block, value.unitId && childLabels.unit].filter(Boolean) as string[];
            set(projectId ? { projectId } : {}, cleared, t('forms:fields.project'));
          }}
          testId="unit-picker-project"
        />
        {project && isPlots ? (
          <SelectControl
            label={t('forms:fields.block')}
            options={blockOptions}
            value={value.block ?? null}
            onChange={(block) => set({ projectId: value.projectId, ...(block ? { block } : {}) }, value.unitId ? [childLabels.unit] : [], childLabels.block)}
            testId="unit-picker-block"
          />
        ) : (
          <SelectControl
            label={t('forms:fields.tower')}
            options={towerOptions}
            value={value.towerId ?? null}
            isDisabled={!project}
            description={!project ? t('forms:unitPicker.chooseProjectFirst') : undefined}
            onChange={(towerId) =>
              set(
                { projectId: value.projectId, ...(towerId ? { towerId } : {}) },
                [value.floorId && childLabels.floor, value.unitId && childLabels.unit].filter(Boolean) as string[],
                childLabels.tower,
              )
            }
            testId="unit-picker-tower"
          />
        )}
        {!isPlots && (
          <SelectControl
            label={t('forms:fields.floor')}
            options={floorOptions}
            value={value.floorId ?? null}
            isDisabled={!value.towerId}
            description={!value.towerId ? t('forms:unitPicker.chooseTowerFirst') : undefined}
            onChange={(floorId) =>
              set({ projectId: value.projectId, towerId: value.towerId, ...(floorId ? { floorId } : {}) }, value.unitId ? [childLabels.unit] : [], childLabels.floor)
            }
            testId="unit-picker-floor"
          />
        )}
        <SelectControl
          label={t('forms:fields.unit')}
          options={unitOptions}
          value={value.unitId ?? null}
          isDisabled={isPlots ? !value.block : !value.floorId}
          isInvalid={!!fieldState.error && !!value.projectId && !value.unitId}
          description={
            isPlots
              ? !value.block
                ? t('forms:unitPicker.chooseBlockFirst')
                : t('forms:unitPicker.onlyAvailable')
              : !value.floorId
                ? t('forms:unitPicker.chooseFloorFirst')
                : `${t('forms:unitPicker.unitsShown', { count: unitOptions.length })}. ${t('forms:unitPicker.onlyAvailable')}`
          }
          onChange={(unitId) => {
            const unit = units.data?.find((u) => u.id === unitId);
            field.onChange({ ...value, ...(unitId ? { unitId, unitRef: unit?.ref } : { unitId: undefined, unitRef: undefined }) });
          }}
          renderOption={(o) => (
            <span className="flex flex-col">
              <span className={o.isDisabled ? 'text-muted' : 'text-text'}>{o.label}</span>
              <span className="text-xs text-muted">{o.description}</span>
            </span>
          )}
          testId="unit-picker-unit"
        />
      </div>
      {isPlots && <p className="text-xs text-muted">{t('forms:unitPicker.noTowers')}</p>}
      <StandaloneError id={errorId} messageKey={fieldState.error?.message} />
    </fieldset>
  );
}
