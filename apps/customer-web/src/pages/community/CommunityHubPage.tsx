import { Link, useApiQuery, useT } from '@repo/ui';
import { NotAvailable } from '../operations/ProblemText';
interface Home { site:string; servicesCount:number; links:{notices:string;requests:string;services:string|null};demo:boolean }
interface Service {id:string;name:string;category:string;description:string}
interface Directory {items:Service[];demo:boolean}
export default function CommunityHubPage(){
 const {t}=useT();
 const services=window.location.pathname.endsWith('/services');
 const home=useApiQuery<Home>({method:'GET',path:'/portal/community/home'},{retry:false});
 const directory=useApiQuery<Directory>({method:'GET',path:'/portal/community/services'},{retry:false,enabled:services});
 if(home.isError)return <NotAvailable error={home.error}/>;
 if(!home.data)return <p role="status">{t('operations:community.loading')}</p>;
 return <main className="@container space-y-5" data-testid="resident-community-hub">
  <header className="space-y-2"><h1 className="text-2xl font-bold" id="page-title">{t('operations:communityHub.title')}</h1><p className="text-muted">{home.data.site}</p>
  <p className="text-xs text-muted">{t('operations:community.simulated')}</p></header>
  <nav aria-label={t('operations:communityHub.links')} className="grid gap-3 @lg:grid-cols-2">
   <Link href={home.data.links.notices} variant="plain" className="rounded-card border border-border bg-panel p-5 font-semibold">{t('operations:communityHub.notices')}</Link>
   <Link href={home.data.links.requests} variant="plain" className="rounded-card border border-border bg-panel p-5 font-semibold">{t('operations:communityHub.requests')}</Link>
   {home.data.links.services&&<Link href={home.data.links.services} variant="plain" className="rounded-card border border-border bg-panel p-5 font-semibold">{t('operations:communityHub.directory')} ({home.data.servicesCount})</Link>}
  </nav>
  {services&&(directory.isError?<NotAvailable error={directory.error}/>:!directory.data?<p role="status">{t('operations:community.loading')}</p>:
  <section className="space-y-3"><h2 className="text-xl font-semibold">{t('operations:communityHub.directory')}</h2>
   <p className="text-sm text-muted">{t('operations:communityHub.safeContact')}</p>
   {directory.data.items.length===0?<p>{t('operations:communityHub.empty')}</p>:
   <ul className="grid gap-3 @lg:grid-cols-2">{directory.data.items.map(s=><li key={s.id} className="min-w-0 rounded-card border border-border bg-panel p-4">
    <h3 className="break-words font-semibold"><bdi>{s.name}</bdi></h3><p className="text-xs text-muted">{s.category}</p><p className="mt-2 break-words text-sm"><bdi>{s.description}</bdi></p>
   </li>)}</ul>}</section>)}
 </main>;
}
