import type { Handler, HandlerContext } from '../handler-types';
import { authorize, invalid, notFound, requires } from '../handler-types';
import { opsSite, residentOps, siteRecord } from '../operations/site';

interface Service { id: string; name: string; category: 'plumbing' | 'electrical' | 'cleaning' | 'other'; description: string; approved: boolean; submittedAt: string }
interface HubState { services: Service[]; }
const state = (ctx: HandlerContext) => ctx.demo.section<HubState>('community_hub:' + opsSite(ctx).siteId, () => ({
 services: [
  { id:'svc_demo_001', name:'Demo Plumbing Team', category:'plumbing', description:'Fictional on-site plumbing service. Contact through society office.',approved:true,submittedAt:'2026-10-20' },
  { id:'svc_demo_002', name:'Demo Electrician Desk', category:'electrical', description:'Fictional electrician service. No real provider or phone number.',approved:true,submittedAt:'2026-10-21' },
 ] }));
function resident(ctx: HandlerContext, feature?: 'community_hub.services_directory') {
 const r=residentOps(ctx,{module:'community_hub',...(feature?{feature}:{})});
 // Hub is limited to current residents; ownership or payer status alone grants no social access.
 if(!r.flats.some(f=>f.roles.includes('occupant'))) notFound(ctx);
 return r;
}
function office(ctx: HandlerContext) {
 if(ctx.persona?.app!=='backoffice') notFound(ctx);
 const site=opsSite(ctx); authorize(ctx,'community_hub',siteRecord(site),'directory.manage'); return site;
}
const publicService=({approved:_approved,...item}:Service)=>item;
export const COMMUNITY_HUB_HANDLERS:readonly Handler[]=[
 {method:'GET',pattern:/^\/portal\/community\/home$/,access:requires('resident_portal','portal.use','operational'),handle:ctx=>{
  const r=resident(ctx), hub=state(ctx);
  return {site:r.site.name,siteId:r.site.siteId,servicesCount:ctx.access?.features.includes('community_hub.services_directory')?hub.services.filter(s=>s.approved).length:0,
    links:{notices:'/customer/portal/community-notices',requests:'/customer/portal/services-home',chat:null,services:ctx.access?.features.includes('community_hub.services_directory')?'/customer/portal/community/services':null},
    demo:true};
 }},
 {method:'GET',pattern:/^\/portal\/community\/services$/,access:requires('resident_portal','portal.use','operational'),handle:ctx=>{
  resident(ctx,'community_hub.services_directory');
  const category=String(ctx.req.query?.category??'all');
  if(!['all','plumbing','electrical','cleaning','other'].includes(category))invalid(ctx,'category');
  return {items:state(ctx).services.filter(s=>s.approved&&(category==='all'||s.category===category)).map(publicService),demo:true};
 }},
 {method:'GET',pattern:/^\/ops\/community\/services$/,access:requires('community_hub','directory.manage','operational','community_hub.services_directory'),handle:ctx=>{
  office(ctx);return {items:state(ctx).services.map(s=>({...s})),demo:true};
 }},
 {method:'POST',pattern:/^\/ops\/community\/services$/,access:requires('community_hub','directory.manage','operational','community_hub.services_directory'),handle:ctx=>{
  office(ctx);const b=(ctx.req.body??{}) as Partial<Service>;
  if(typeof b.name!=='string'||b.name.trim().length<3||b.name.length>80)invalid(ctx,'name');
  if(!['plumbing','electrical','cleaning','other'].includes(b.category??''))invalid(ctx,'category');
  if(typeof b.description!=='string'||b.description.trim().length<12||b.description.length>400)invalid(ctx,'description');
  const s=state(ctx);const item:Service={id:ctx.demo.nextId('svc'),name:b.name.trim(),category:b.category!,description:b.description.trim(),approved:false,submittedAt:ctx.at.slice(0,10)};
  s.services.push(item);ctx.demo.save();return {...item};
 }},
 {method:'POST',pattern:/^\/ops\/community\/services\/(?<id>[\w-]+)\/review$/,access:requires('community_hub','directory.manage','operational','community_hub.services_directory'),handle:ctx=>{
  office(ctx);const s=state(ctx),item=s.services.find(x=>x.id===ctx.params.id);if(!item)notFound(ctx);
  const approved=(ctx.req.body as {approved?:unknown}|undefined)?.approved;
  if(typeof approved!=='boolean')invalid(ctx,'approved');
  item.approved=approved;ctx.demo.save();return {...item};
 }}
];
