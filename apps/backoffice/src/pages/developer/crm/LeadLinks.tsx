import type { OpportunityList } from '@repo/contracts';
import { useApiQuery, useT } from '@repo/ui';
import { KanbanSquare, Sparkles, UserCog } from 'lucide-react';
import { LinkButton } from '../../society/hr/hkit';
import { E1 } from './kit';

/**
 * Gate E.1 cross-links on Lead 360 (CRM-003): the lead's opportunity, or "Convert to opportunity" for a
 * qualified lead the reader may convert, and "Reassign" for a sales manager. Asks the E.1 endpoint, so
 * a link appears only when the reader may open what it points to.
 */
export function E1LeadLinks({ leadId, status }: { leadId: string; status: string }) {
  const { t } = useT();
  const list = useApiQuery<OpportunityList>({ method: 'GET', path: '/opportunities', query: { view: 'board', lead: leadId } });
  if (!list.data) return null;
  const opp = list.data.items[0];
  return (
    <>
      {opp ? (
        <LinkButton href={E1.opportunity(opp.id)} size="sm" variant="secondary" icon={KanbanSquare} testId="lead-opportunity-link">
          {t('sales:lead.openOpportunity', { ref: opp.ref })}
        </LinkButton>
      ) : list.data.canManage && status === 'qualified' ? (
        <LinkButton href={E1.pipeline({ drawer: 'convert', lead: leadId })} size="sm" variant="secondary" icon={Sparkles} testId="lead-convert-link">
          {t('sales:lead.convert')}
        </LinkButton>
      ) : null}
      {list.data.canAssign && (
        <LinkButton href={E1.assignment(leadId)} size="sm" variant="secondary" icon={UserCog} testId="lead-reassign-link">
          {t('sales:lead.reassign')}
        </LinkButton>
      )}
    </>
  );
}
