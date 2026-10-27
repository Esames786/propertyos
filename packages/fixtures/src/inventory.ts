import type { Floor, Project, Tower, Unit, UnitStatus, UnitType } from '@repo/contracts';
import { createRandom, pad } from './seed';

export const PROJECTS: readonly Project[] = [
  { id: 'prj_heights', ref: 'LH', name: 'Larkspur Heights', city: 'Lahore', kind: 'towers', siteId: 'site_lk_heights', legalEntityId: 'le_larkspur' },
  { id: 'prj_gardens', ref: 'LG', name: 'Larkspur Gardens', city: 'Islamabad', kind: 'plots', siteId: 'site_lk_gardens', legalEntityId: 'le_larkspur' },
];

export const TOWERS: readonly Tower[] = [
  { id: 'twr_lh_a', projectId: 'prj_heights', name: 'A', floorCount: 18 },
  { id: 'twr_lh_b', projectId: 'prj_heights', name: 'B', floorCount: 14 },
  { id: 'twr_lh_c', projectId: 'prj_heights', name: 'C', floorCount: 10 },
];

export const FLOORS: readonly Floor[] = TOWERS.flatMap((t) =>
  Array.from({ length: t.floorCount }, (_, i) => ({
    id: `flr_${t.id.slice(4)}_${pad(i + 1, 2)}`,
    towerId: t.id,
    level: i + 1,
  })),
);

export const GARDEN_BLOCKS = ['Phase 1', 'Phase 2'] as const;

const STATUS_WEIGHTS: ReadonlyArray<readonly [UnitStatus, number]> = [
  ['available', 52],
  ['held', 7],
  ['reserved', 6],
  ['booked', 20],
  ['allocated', 6],
  ['handover_ready', 3],
  ['handed_over', 2],
  ['occupied', 2],
  ['blocked', 2],
];

const AREA: Record<UnitType, [number, number]> = {
  apartment_1bed: [650, 780],
  apartment_2bed: [1050, 1250],
  apartment_3bed: [1500, 1800],
  penthouse: [3200, 3600],
  villa: [3500, 5000],
  plot: [1125, 4500],
  shop: [220, 900],
};

/** Price in whole rupees rounded to the nearest thousand, as a 2-decimal string. */
function price(area: number, ratePerSqft: number): string {
  return `${Math.round((area * ratePerSqft) / 1000) * 1000}.00`;
}

function generateUnits(): Unit[] {
  const rnd = createRandom(7_2026);
  const units: Unit[] = [];
  for (const tower of TOWERS) {
    for (const floor of FLOORS.filter((f) => f.towerId === tower.id)) {
      const top = floor.level === tower.floorCount;
      for (let n = 1; n <= 8; n++) {
        const type: UnitType = top
          ? n <= 2 ? 'penthouse' : 'apartment_3bed'
          : n === 1 || n === 8 ? 'apartment_3bed' : n === 2 || n === 7 ? 'apartment_2bed' : rnd.pick(['apartment_1bed', 'apartment_2bed'] as const);
        const [min, max] = AREA[type];
        const area = rnd.int(min, max);
        const rate = 18500 + floor.level * 220;
        const ref = `LH-${tower.name}-${pad(floor.level, 2)}${pad(n, 2)}`;
        units.push({
          id: `unt_${ref.toLowerCase().replace(/-/g, '_')}`,
          ref,
          projectId: tower.projectId,
          towerId: tower.id,
          floorId: floor.id,
          type,
          areaSqft: area,
          price: { amount: price(area, rate), currency: 'PKR' },
          status: rnd.weighted(STATUS_WEIGHTS),
        });
      }
    }
  }
  GARDEN_BLOCKS.forEach((block, b) => {
    for (let n = 1; n <= 80; n++) {
      const type: UnitType = n % 4 === 0 ? 'villa' : 'plot';
      const area = type === 'plot' ? rnd.pick([1125, 2250, 4500] as const) : rnd.int(...AREA.villa);
      const ref = `LG-P${b + 1}-${pad(n, 3)}`;
      units.push({
        id: `unt_${ref.toLowerCase().replace(/-/g, '_')}`,
        ref,
        projectId: 'prj_gardens',
        block,
        type,
        areaSqft: area,
        price: { amount: price(area, type === 'villa' ? 21000 : 9500), currency: 'PKR' },
        status: rnd.weighted(STATUS_WEIGHTS),
      });
    }
  });
  return units;
}

export const UNITS: readonly Unit[] = generateUnits();
