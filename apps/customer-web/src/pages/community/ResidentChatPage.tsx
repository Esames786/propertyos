import { Chat, DirectionalIcon, Link, useQueryParam, useT } from '@repo/ui';
import { ArrowLeft } from 'lucide-react';
import { COMMUNITY, OPS } from '../../nav.config';

/**
 * PORTAL-031 resident chat and PORTAL-032 its phone route (`/customer/portal/chat/:groupId`). Rule R
 * and the group rules are the server's; this page only places the shared chat in the resident app.
 * `?group=` (the register's address on wider screens) opens the same conversation.
 */
export default function ResidentChatPage({ groupId }: { groupId?: string }) {
  const { t } = useT();
  const [query] = useQueryParam('group');
  return (
    <Chat
      api="/portal/chat"
      groupId={groupId ?? query}
      listHref={COMMUNITY.chat}
      groupHref={COMMUNITY.chatGroup}
      noticesHref={OPS.notices}
      resident
      headerExtra={
        <Link href={COMMUNITY.home} className="inline-flex min-h-11 items-center gap-1.5 text-sm" data-testid="chat-community-home">
          <DirectionalIcon icon={ArrowLeft} className="size-4" />
          {t('community:home.title')}
        </Link>
      }
    />
  );
}
