import type { FlatFact } from '@repo/contracts';
/** Pure, privacy-aware auto groups; computed from active residency rather than manual member lists. */
export interface CommunityFlat { id: string; code: string; buildingId: string; floor: number }
export interface CommunityGroup { id: string; kind: 'site' | 'block' | 'floor'; title: string; memberPartyIds: string[] }
export const activeOn = (fact: Pick<FlatFact, 'from' | 'to'>, on: string) => fact.from <= on && (!fact.to || on < fact.to);
export function smartGroups(flats: readonly CommunityFlat[], facts: readonly FlatFact[], on: string): CommunityGroup[] {
  const active = facts.filter(f => f.role === 'occupant' && f.occupancyKind !== 'association' && activeOn(f, on));
  const parties = (ids: ReadonlySet<string>) => [...new Set(active.filter(f => ids.has(f.flatId)).map(f => f.partyId))].sort();
  const groups: CommunityGroup[] = [{ id: 'site', kind: 'site', title: 'Whole community', memberPartyIds: parties(new Set(flats.map(f => f.id))) }];
  for (const buildingId of [...new Set(flats.map(f => f.buildingId))].sort()) {
    const building = flats.filter(f => f.buildingId === buildingId);
    groups.push({ id: 'block:'+buildingId, kind: 'block', title: buildingId, memberPartyIds: parties(new Set(building.map(f => f.id))) });
    for(const floor of [...new Set(building.map(f => f.floor))].sort((a,b)=>a-b)) {
      groups.push({ id: 'floor:'+buildingId+':'+floor, kind: 'floor', title: buildingId+' · '+floor, memberPartyIds: parties(new Set(building.filter(f => f.floor === floor).map(f => f.id))) });
    }
  }
  return groups;
}
/** Public/resident UI may only show groups the signed-in member belongs to; never member names. */
export function residentGroups(groups: readonly CommunityGroup[], partyId: string) {
  return groups.filter(g => g.memberPartyIds.includes(partyId)).map(({id,kind,title})=>({id,kind,title}));
}
