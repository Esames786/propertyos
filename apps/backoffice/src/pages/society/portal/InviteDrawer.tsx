import type { InvitationChannel, InviteResult, PortalAccessRow } from '@repo/contracts';
import { formatCalendarDate, useLocale } from '@repo/i18n';
import { Button, Drawer, InlineAlert, SegmentedControl, useApiMutation, useAnnounce, useT, useToast } from '@repo/ui';
import { CheckCircle2, Copy, ExternalLink, Printer, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { customerOrigin } from './pkit';

const CHANNELS: readonly InvitationChannel[] = ['whatsapp', 'sms', 'email', 'printed_code'];

/** Why a person would be skipped on this channel, before anything is sent (the server decides again). */
function eligibility(row: PortalAccessRow, channel: InvitationChannel): InviteResult['skipped'][number]['reason'] | null {
  if (!row.verified) return 'not_verified';
  if (row.status === 'active' || row.status === 'inactive') return 'already_active';
  if ((channel === 'sms' || channel === 'whatsapp') && !row.phoneMasked) return 'no_contact';
  if (channel !== 'printed_code' && !row.consents.some((c) => c.channel === channel && c.consented)) return 'no_consent';
  return null;
}

/**
 * RES-009: invite or resend (simulated). Shows who will be invited on the chosen channel and why
 * anyone is skipped (no verified link, no consent for the channel, no number), the message a real
 * system would send, then each sent invitation's link, which the demo can open as the resident.
 */
export function InviteDrawer({ rows, isOpen, onOpenChange }: { rows: PortalAccessRow[]; isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const announce = useAnnounce();
  const [channel, setChannel] = useState<InvitationChannel>('whatsapp');
  const [result, setResult] = useState<InviteResult | null>(null);
  const send = useApiMutation<InviteResult>();
  const split = useMemo(() => rows.map((r) => ({ row: r, skip: eligibility(r, channel) })), [rows, channel]);
  const ready = split.filter((x) => !x.skip);
  const first = ready[0]?.row;
  const close = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setResult(null);
      send.reset();
    }
  };
  const nameOf = (partyId: string) => rows.find((r) => r.partyId === partyId)?.name ?? partyId;

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={close}
      title={rows.length === 1 ? t('identity:invite.titleOne', { name: rows[0]!.name }) : t('identity:invite.titleMany', { count: rows.length })}
      subtitle={t('identity:invite.subtitle')}
      testId="invite-drawer"
      footer={
        result ? (
          <Button variant="primary" onPress={() => close(false)} data-testid="invite-done">
            {t('identity:invite.done')}
          </Button>
        ) : (
          <Button
            variant="primary"
            icon={channel === 'printed_code' ? Printer : Send}
            isDisabled={!ready.length}
            isPending={send.isPending}
            onPress={() =>
              send.mutate(
                { method: 'POST', path: '/portal-invitations', body: { partyIds: rows.map((r) => r.partyId), channel, ...(rows.length === 1 && rows[0]!.flats[0] ? { flatId: rows[0]!.flats[0].flatId } : {}) } },
                {
                  onSuccess: (r) => {
                    setResult(r);
                    announce(t('identity:invite.sentAnnounce', { count: r.sent.length }));
                    toast.success(t('identity:invite.sentToast', { count: r.sent.length }));
                  },
                },
              )
            }
            data-testid="invite-send"
          >
            {channel === 'printed_code' ? t('identity:invite.prepareCodes', { count: ready.length }) : t('identity:invite.send', { count: ready.length })}
          </Button>
        )
      }
    >
      {result ? (
        <div className="space-y-4" data-testid="invite-result">
          <InlineAlert tone="success" title={t('identity:invite.resultTitle', { count: result.sent.length })}>
            {t('identity:invite.simulated')}
          </InlineAlert>
          <ul className="space-y-2">
            {result.sent.map((s) => {
              const url = `${customerOrigin()}${s.invitation.demoLink ?? ''}`;
              return (
                <li key={s.partyId} className="rounded-tile border border-border p-3" data-testid="invite-sent">
                  <p className="flex items-center gap-2 text-sm font-semibold text-text">
                    <CheckCircle2 aria-hidden className="size-4 text-success" />
                    <bdi>{nameOf(s.partyId)}</bdi>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {t(`identity:channels.${s.invitation.channel}`)} · {t('identity:invite.expires', { date: formatCalendarDate(s.invitation.expiresAt.slice(0, 10), locale) })}
                    {s.invitation.resendCount > 0 ? ` · ${t('identity:invite.resent', { count: s.invitation.resendCount })}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {/* The resident app is another app: a plain link, opened in a new tab. */}
                    <a href={url} target="_blank" rel="noreferrer" data-testid="invite-open-link" className="inline-flex min-h-9 items-center gap-1.5 rounded-sm text-sm text-primary underline decoration-1 underline-offset-[3px] outline-none hover:decoration-2 focus-visible:outline-2 focus-visible:outline-focus">
                      <ExternalLink aria-hidden className="size-4" />
                      {t('identity:invite.openAsResident')}
                    </a>
                    <Button
                      size="sm"
                      variant="quiet"
                      icon={Copy}
                      onPress={() => {
                        void navigator.clipboard?.writeText(url).catch(() => undefined);
                        toast.info(t('identity:invite.copied'));
                      }}
                    >
                      {t('identity:invite.copy')}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {result.skipped.length > 0 && (
            <InlineAlert tone="warning" title={t('identity:invite.skippedTitle', { count: result.skipped.length })} data-testid="invite-skipped">
              <ul className="list-disc ps-5">
                {result.skipped.map((s) => (
                  <li key={s.partyId}>
                    <bdi>{nameOf(s.partyId)}</bdi>: {t(`identity:invite.skip.${s.reason}`)}
                  </li>
                ))}
              </ul>
            </InlineAlert>
          )}
          {channel === 'printed_code' && result.sent.length > 0 && <PrintSheet sent={result.sent} nameOf={nameOf} flatOf={(id) => rows.find((r) => r.partyId === id)?.flats.map((f) => f.flatCode).join(', ') ?? ''} />}
        </div>
      ) : (
        <div className="space-y-5">
          <SegmentedControl<InvitationChannel> label={t('identity:invite.channel')} value={channel} onChange={setChannel} options={CHANNELS.map((c) => ({ id: c, label: t(`identity:channels.${c}`) }))} testId="invite-channel" />
          <p className="text-sm text-muted">{t(`identity:invite.channelHint.${channel}`)}</p>
          {split.some((x) => x.skip) && (
            <InlineAlert tone="warning" title={t('identity:invite.willSkip', { count: split.filter((x) => x.skip).length })} data-testid="invite-will-skip">
              <ul className="list-disc ps-5">
                {split
                  .filter((x) => x.skip)
                  .map((x) => (
                    <li key={x.row.partyId}>
                      <bdi>{x.row.name}</bdi>: {t(`identity:invite.skip.${x.skip!}`)}
                    </li>
                  ))}
              </ul>
            </InlineAlert>
          )}
          {first && (
            <figure className="rounded-tile border border-border bg-raised p-4" data-testid="invite-preview">
              <figcaption className="text-xs font-semibold tracking-wide text-muted uppercase">{t('identity:invite.previewTitle')}</figcaption>
              <p className="mt-2 text-sm text-text">
                {t(channel === 'printed_code' ? 'identity:invite.letter' : 'identity:invite.message', {
                  name: first.name.split(/\s+/)[0],
                  flat: first.flats[0]?.flatCode ?? '',
                  days: 14,
                })}
              </p>
            </figure>
          )}
          <p className="text-xs text-muted">{t('identity:invite.rules')}</p>
        </div>
      )}
    </Drawer>
  );
}

/** Printable invitation letters: one per resident, with the address to open and the steps. */
function PrintSheet({ sent, nameOf, flatOf }: { sent: InviteResult['sent']; nameOf: (id: string) => string; flatOf: (id: string) => string }) {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <Button variant="secondary" icon={Printer} onPress={() => window.print()} data-testid="invite-print">
        {t('identity:invite.print')}
      </Button>
      <div className="print-sheet space-y-3" data-testid="print-sheet">
        {sent.map((s) => (
          <section key={s.partyId} className="rounded-tile border border-dashed border-border-control p-4 break-inside-avoid">
            <p className="text-sm font-semibold text-text">
              <bdi>{nameOf(s.partyId)}</bdi> · <bdi dir="ltr" className="ltr-ref">{flatOf(s.partyId)}</bdi>
            </p>
            <p className="mt-1 text-sm text-muted">{t('identity:invite.letterSteps')}</p>
            <p className="mt-2 font-mono text-xs break-all text-text">
              <bdi dir="ltr">{`${customerOrigin()}${s.invitation.demoLink ?? ''}`}</bdi>
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
