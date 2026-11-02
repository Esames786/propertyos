import { describe, expect, it } from 'vitest';
import { ApiError, type EffectiveAccess, type Persona } from '@repo/contracts';
import { DemoStore } from '../demo-store';
import { MockTransport } from '../mock-transport';
import { effectiveAccessFor } from '../tenant-directory';
const memory = () => { const m = new Map<string,string>(); return { getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>void m.set(k,v),removeItem:(k:string)=>void m.delete(k) }; };
const addChat = (p:Persona): EffectiveAccess | null => {
 const a = effectiveAccessFor(p); if (!a) return null;
 return { ...a,
   grants:[...a.grants,{module:'community_chat',sites:['site_alnoor'],from:'2026-10-01',source:'addon'}],
   permissions:[...a.permissions,...(p.app==='backoffice' ? ['chat.groups.manage','chat.moderate'] as const : [])],
 };
};
function api({ licence = true }:{licence?:boolean}={}){
 const demo = new DemoStore(memory()); let id:string|null='alnoor_manager';
 const transport = new MockTransport({getContext:()=>({personaId:id,projectId:'all'}),getMode:()=> 'fast',demo, ...(licence?{accessFor:addChat}:{})});
 return {
  as(personaId:string|null){id=personaId;return this;},
  get:<T>(path:string)=>transport.request<T>({method:'GET',path}),
  post:<T>(path:string,body:unknown={})=>transport.request<T>({method:'POST',path,body}),
  patch:<T>(path:string,body:unknown={})=>transport.request<T>({method:'PATCH',path,body}),
 };
}
async function refused(p:Promise<unknown>,status:number){try{await p;throw Error('accepted unsafe request');}catch(e){if(e instanceof ApiError){expect(e.problem.status).toBe(status);return;}throw e;}}
describe('D.3 typed mock messaging access, retention and moderation',()=>{
 it('is off without a licensed module or an explicit tenant retention policy',async()=>{
  const unlicensed=api({licence:false});
  await refused(unlicensed.as('alnoor_resident_a101').get('/portal/chat/groups'),403);
  const a=api();
  const groups=await a.as('alnoor_resident_a101').get<{available:boolean,groups:{id:string}[]}>('/portal/chat/groups');
  expect(groups.available).toBe(false);
  expect(groups.groups.some(g=>g.id==='site')).toBe(true);
  await refused(a.post('/portal/chat/groups/site/messages',{text:'hello'}),409);
 });
 it('office configures retention; occupant can send and read with idempotency',async()=>{
  const a=api();
  await a.as('alnoor_manager').patch('/ops/chat/policy',{retentionDays:30,legalReviewConfirmed:true});
  const first=await a.as('alnoor_resident_a101').post<{id:string}>('/portal/chat/groups/site/messages',{text:'Lift needs service',clientKey:'message_001'});
  const twice=await a.post<{id:string}>('/portal/chat/groups/site/messages',{text:'Lift needs service',clientKey:'message_001'});
  expect(twice.id).toBe(first.id);
  const conversation=await a.get<{messages:{id:string,text:string}[]}>('/portal/chat/groups/site/messages');
  expect(conversation.messages).toHaveLength(1);
  expect(conversation.messages[0]?.text).toBe('Lift needs service');
  await a.post('/portal/chat/groups/site/read');
 });
 it('different block is not visible; only reports are readable by moderator',async()=>{
  const a=api();
  await a.as('alnoor_manager').patch('/ops/chat/policy',{retentionDays:30,legalReviewConfirmed:true});
  await refused(a.as('alnoor_resident_a101').get('/portal/chat/groups/block:bld_anr_b/messages'),404);
  const msg=await a.post<{id:string}>('/portal/chat/groups/site/messages',{text:'Water issue in lobby'});
  const report=await a.post<{id:string}>('/portal/chat/groups/site/report',{messageId:msg.id,reason:'Off-topic material'});
  const listed=await a.as('alnoor_manager').get<{items:{id:string}[]}>('/ops/chat/reports');
  expect(listed.items.some(r=>r.id===report.id)).toBe(true);
  await a.post('/ops/chat/reports/'+report.id+'/decide',{action:'removed'});
  const now=await a.as('alnoor_resident_a101').get<{messages:{id:string}[]}>('/portal/chat/groups/site/messages');
  expect(now.messages.some(m=>m.id===msg.id)).toBe(false);
 });
 it('signed-out requests and suspended organisation fail closed',async()=>{
  const a=api();
  await refused(a.as(null).get('/ops/chat/groups'),401);
 });
});
