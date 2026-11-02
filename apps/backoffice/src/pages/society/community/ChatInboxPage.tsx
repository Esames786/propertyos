import { buttonClass, Chat, cn, Link, useQueryParam, useSession, useT } from '@repo/ui';
import { Settings2 } from 'lucide-react';
import { COMMUNITY, OPS } from '../../../nav.config';

/**
 * CHAT-001 the office's chat inbox and CHAT-002 a conversation (`/backoffice/chat/:groupId`). Staff who
 * may chat are in the whole community's group and the office team; they never read a block or floor
 * conversation (moderation is through reports only). The shared chat does the rest.
 */
export default function ChatInboxPage({ groupId }: { groupId?: string }) {
  const { t } = useT();
  const { allows } = useSession();
  const [query] = useQueryParam('group');
  const settings = allows({ module: 'community_chat', anyOf: ['chat.groups.manage', 'chat.moderate'] });
  return (
    <Chat
      api="/ops/chat"
      groupId={groupId ?? query}
      listHref={COMMUNITY.inbox}
      groupHref={COMMUNITY.group}
      noticesHref={OPS.notices()}
      resident={false}
      headerExtra={
        settings ? (
          <Link href={COMMUNITY.settings()} variant="plain" className={cn(buttonClass('secondary', 'md', 'gap-2'), 'max-w-full whitespace-normal text-start')} data-testid="chat-settings-link">
            <Settings2 aria-hidden className="size-4 shrink-0" />
            {t('community:office.settingsLink')}
          </Link>
        ) : null
      }
    />
  );
}
