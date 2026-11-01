import { describe, expect, it } from 'vitest';
import type { FlatFact } from '@repo/contracts';
import { smartGroups, residentGroups } from './smart-groups';
const flats = [
 {id:'flat_a1',code:'A-101',buildingId:'A',floor:1},
 {id:'flat_a2',code:'A-201',buildingId:'A',floor:2},
 {id:'flat_b1',code:'B-101',buildingId:'B',floor:1},
];
const fact = (partyId:string,flatId:string,from='2026-01-01',to?:string):FlatFact=>({id:partyId+'_'+flatId,partyId,partyName:'Fictional',role:'occupant',flatId,flatCode:flatId,from,...(to?{to}:{})});
describe('D.3 dynamic community groups',()=>{
 it('builds site, block, and floor groups without duplicate occupants',()=>{
  const g=smartGroups(flats,[fact('p1','flat_a1'),fact('p1','flat_a1'),fact('p2','flat_a2'),fact('p3','flat_b1')],'2026-10-30');
  expect(g.find(x=>x.id==='site')?.memberPartyIds).toEqual(['p1','p2','p3']);
  expect(g.find(x=>x.id==='block:A')?.memberPartyIds).toEqual(['p1','p2']);
  expect(g.find(x=>x.id==='floor:A:1')?.memberPartyIds).toEqual(['p1']);
  expect(g).toHaveLength(6);
 });
 it('removes moved-out occupants and does not disclose other member identities in resident list',()=>{
  const g=smartGroups(flats,[fact('former','flat_a1','2026-01-01','2026-10-31'),fact('new','flat_a1','2026-10-31'),fact('b','flat_b1')],'2026-11-01');
  expect(residentGroups(g,'former')).toEqual([]);
  expect(residentGroups(g,'new').map(x=>x.id)).toEqual(['site','block:A','floor:A:1']);
  expect(JSON.stringify(residentGroups(g,'new'))).not.toContain('"b"');
 });
 it('does not give owners, payers or association occupancy access merely because of billing relationships',()=>{
  const f=[{...fact('owner','flat_a1'),role:'owner' as const},{...fact('payer','flat_a1'),role:'payer' as const},{...fact('association','flat_a1'),occupancyKind:'association' as const}];
  const g=smartGroups(flats,f,'2026-11-01');expect(g.find(x=>x.id==='site')?.memberPartyIds).toEqual([]);
 });
});
