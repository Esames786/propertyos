import { Link, useT } from '@repo/ui';

/** Relevant E.3 pages stay one click away; every destination rechecks its own server permission. */
export function PricingRelatedLinks({ current }: { current: 'templates' | 'builder' | 'policies' | 'commercial' }) {
  const { t } = useT();
  const tabs = [
    { key: 'templates', href: '/backoffice/com/payment-plan-templates', title: t('pricing:templateTitle') },
    { key: 'builder', href: '/backoffice/com/payment-plan-builder', title: t('pricing:previewTitle') },
    { key: 'policies', href: '/backoffice/com/pricing-policies', title: t('pricing:policyTitle') },
    { key: 'commercial', href: '/backoffice/com/fees-and-discounts', title: t('pricing:commercialTitle') },
  ] as const;
  return (
    <nav aria-label={t('pricing:policyNav')} className="flex min-w-0 flex-wrap gap-2" data-testid="pricing-related-nav">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          variant="plain"
          aria-current={current === tab.key ? 'page' : undefined}
          className="min-h-11 rounded-control border border-border px-3 py-2 text-sm font-medium text-text data-hovered:bg-raised data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
        >
          {tab.title}
        </Link>
      ))}
    </nav>
  );
}
