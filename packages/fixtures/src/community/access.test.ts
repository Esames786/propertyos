import { describe, expect, it } from 'vitest';
import { type EffectiveAccess } from '@repo/contracts';
import { communityResidentAccess } from './access';
const at = '2026-11-01T00:00:00Z';
const record = { siteId: 'site_a', legalEntityId: 'le_a', unitId: 'flat_101' };
const access = (): EffectiveAccess => ({
 tenant: { id:'tenant_a',type:'association',status:'active',suspensionPolicy:{allowSettlement:true} },
 grants: [
  {module:'resident_portal',sites:['site_a'],from:'2026-10-01',source:'addon'},
  {module:'community_chat',sites:['site_a'],from:'2026-10-01',source:'addon'},
  {module:'community_hub',sites:['site_a'],from:'2026-10-01',source:'addon'},
 ],
 features:['community_hub.polls'],
 permissions:['portal.use'],
 scopes:[{type:'party',partyId:'resident',links:[{unitId:'flat_101',billingAccountId:'account_a',siteId:'site_a',legalEntityId:'le_a',verified:true,from:'2026-10-01'}]}],
 userId:'resident_1',
});
describe('D.3 resident add-on dual grants Rule R',()=>{
 it('allows only the same-site verified portal and service together',()=>{
  expect(communityResidentAccess(access(),at,record,'community_chat')).toEqual({allowed:true});
  expect(communityResidentAccess(access(),at,record,'community_hub','community_hub.polls')).toEqual({allowed:true});
 });
 it('refuses missing resident portal even if chat is licensed',()=>{
  const a=access();a.grants=a.grants.filter(g=>g.module!=='resident_portal');
  expect(communityResidentAccess(a,at,record,'community_chat')).toEqual({allowed:false,reason:'module_not_licensed'});
 });
 it('refuses unlicensed chat and different site',()=>{
  const a=access();a.grants=a.grants.filter(g=>g.module!=='community_chat');
  expect(communityResidentAccess(a,at,record,'community_chat')).toEqual({allowed:false,reason:'module_not_licensed'});
  expect(communityResidentAccess(access(),at,{...record,siteId:'site_b'},'community_chat')).toEqual({allowed:false,reason:'site_not_licensed'});
 });
 it('refuses moved out or unverified residents',()=>{
  const a=access();a.scopes=[{type:'party',partyId:'resident',links:[]}];
  expect(communityResidentAccess(a,at,record,'community_chat')).toEqual({allowed:false,reason:'out_of_scope'});
  const b=access();b.scopes=[{type:'party',partyId:'resident',links:[{unitId:'flat_101',billingAccountId:'account_a',siteId:'site_a',legalEntityId:'le_a',verified:true,from:'2026-10-01',to:'2026-11-01'}]}];
  expect(communityResidentAccess(b,at,record,'community_chat')).toEqual({allowed:false,reason:'out_of_scope'});
 });
 it('refuses missing hub feature and suspended tenant',()=>{
  const a=access();a.features=[];
  expect(communityResidentAccess(a,at,record,'community_hub','community_hub.polls')).toEqual({allowed:false,reason:'feature_not_licensed'});
  const b=access();b.tenant.status='suspended';
  expect(communityResidentAccess(b,at,record,'community_chat')).toEqual({allowed:false,reason:'tenant_suspended'});
 });
});
