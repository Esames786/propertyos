import type { LeadListItem } from '@repo/contracts';
import { Badge, ContactButtons, HueChip, RecordCard, StatusLabel, useT } from '@repo/ui';
import { GraduationCap, Sparkles } from 'lucide-react';
import { LINKS } from '../../nav.config';
import type { ContactTarget } from './ContactSheet';
import type { CrmFormat } from './format';

/** One lead as a card (shared by Sales home and the lead list). */
export function LeadCard({
  lead,
  f,
  onContact,
  from,
}: {
  lead: LeadListItem;
  f: CrmFormat;
  onContact: (kind: 'call' | 'whatsapp', target: ContactTarget) => void;
  /** List URL to return to (filters kept). */
  from?: string;
}) {
  const { t } = useT();
  const fresh = !!lead.createdInSession || !!lead.practice;
  const href = lead.practice ? undefined : `${LINKS.leadWorkspace(lead.id)}${from ? `&from=${encodeURIComponent(from)}` : ''}`;
  const target: ContactTarget = { leadId: lead.id, name: lead.displayName, phone: lead.phone, projectName: lead.projectName };
  return (
    <RecordCard
      testId="lead-card"
      highlight={fresh}
      title={<bdi>{lead.displayName}</bdi>}
      titleHref={href}
      eyebrow={<bdi dir="ltr" className="ltr-ref normal-case">{lead.ref}</bdi>}
      chips={
        <>
          {lead.createdInSession && (
            <Badge tone="info" icon={Sparkles}>
              {t('crm:home.newMarker')}
            </Badge>
          )}
          {lead.practice && (
            <Badge tone="demo" icon={GraduationCap}>
              {t('crm:list.practice')}
            </Badge>
          )}
          <StatusLabel kind="lead" status={lead.status} />
          <HueChip hue="slate">{lead.projectName}</HueChip>
          {lead.interestUnitRef && <HueChip hue="teal">{lead.interestUnitRef}</HueChip>}
        </>
      }
      actions={
        lead.practice ? undefined : (
          <ContactButtons name={lead.displayName} onCall={() => onContact('call', target)} onWhatsApp={() => onContact('whatsapp', target)} />
        )
      }
    >
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">{t('crm:list.budget')}</dt>
          <dd className="font-semibold text-text">
            <bdi dir="ltr" className="ltr-ref">{f.money(lead.budget)}</bdi>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('crm:list.nextFollowUp')}</dt>
          <dd className="text-text">{lead.nextFollowUp ? f.when(lead.nextFollowUp) : t('crm:list.noFollowUp')}</dd>
        </div>
      </dl>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <bdi dir="ltr" className="ltr-ref">{f.phone(lead.phone)}</bdi>
        <span aria-hidden>·</span>
        <span>
          {t('crm:list.owner')}: <bdi>{lead.ownerName}</bdi>
        </span>
      </p>
    </RecordCard>
  );
}
