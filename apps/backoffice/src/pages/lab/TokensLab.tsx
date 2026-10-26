import { CONTRAST, CONTRAST_PAIRS, contrastRatio } from '@repo/tokens';
import { formatNumber, LOCALE_META, NAMESPACES, useLocale } from '@repo/i18n';
import { Badge, PageHeader, Panel, usePreferences, useT } from '@repo/ui';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

const SPACING = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80];
const RADII = ['sm', 'control', 'card'] as const;

/** Reads the token values actually in effect (so "More contrast" shows its own measurements). */
function useTokenValues(): Record<string, string> {
  const { preferences } = usePreferences();
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const names = new Set(CONTRAST_PAIRS.flatMap((p) => [p.fg, p.bg]));
    setValues(Object.fromEntries([...names].map((n) => [n, style.getPropertyValue(`--color-${n}`).trim()])));
  }, [preferences.contrast]);
  return values;
}

export default function TokensLab() {
  const { t, i18n } = useT();
  const { locale } = useLocale();
  const values = useTokenValues();

  return (
    <>
      <PageHeader title={t('nav:pages.labTokens')} breadcrumbs={[{ label: t('nav:pages.lab'), href: '/backoffice/lab' }, { label: t('nav:pages.labTokens') }]} />
      <div className="space-y-6">
        <Panel title={t('lab:tokens.colours')} description={t('lab:tokens.colourIntro')}>
          <div role="region" aria-label={t('a11y:scrollRegion', { label: t('lab:tokens.colours') })} tabIndex={0} className="overflow-x-auto rounded-control">
            <table className="w-full min-w-[40rem] text-sm" data-testid="contrast-table">
              <thead className="bg-sunken text-start text-xs text-text">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-semibold">{t('lab:tokens.pair')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-semibold">{t('lab:tokens.usage')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-semibold">{t('lab:tokens.ratio')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-semibold">{t('lab:tokens.result')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {CONTRAST_PAIRS.map((pair) => {
                  const fg = values[pair.fg];
                  const bg = values[pair.bg];
                  if (!fg || !bg) return null;
                  const ratio = contrastRatio(fg, bg);
                  const pass = ratio >= CONTRAST[pair.kind];
                  return (
                    <tr key={`${pair.fg}-${pair.bg}`}>
                      <td className="px-3 py-2">
                        {pair.kind === 'nonText' ? (
                          // Non-text pairs (control edges, focus, chart marks) are previewed as marks, not text.
                          <span className="inline-flex items-center gap-2 rounded-sm border border-border px-2 py-1 text-text" style={{ background: bg }}>
                            <span aria-hidden className="h-3 w-5 rounded-[3px] border-2" style={{ borderColor: fg, background: fg }} />
                            <span className="ltr-ref text-xs" dir="ltr">
                              {pair.fg} / {pair.bg}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 rounded-sm border border-border px-2 py-1" style={{ background: bg, color: fg }}>
                            <span aria-hidden>{'Aa'}</span>
                            <span className="ltr-ref text-xs" dir="ltr">
                              {pair.fg} / {pair.bg}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted" lang="en">
                        {pair.usage}
                      </td>
                      <td className="px-3 py-2 text-end tabular">
                        <bdi dir="ltr">{formatNumber(ratio, locale, 2)}:1</bdi>
                      </td>
                      <td className="px-3 py-2">
                        {pass ? (
                          <Badge tone="success" icon={CheckCircle2}>{`${t('lab:tokens.pass')} (≥ ${CONTRAST[pair.kind]}:1)`}</Badge>
                        ) : (
                          <Badge tone="error" icon={XCircle}>{`${t('lab:tokens.fail')} (≥ ${CONTRAST[pair.kind]}:1)`}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={t('lab:tokens.typography')} description={t('lab:tokens.typeIntro')}>
          <div className="grid gap-6 @2xl:grid-cols-2">
            {(['en-PK', 'ur-PK'] as const).map((specimenLocale) => {
              const ft = i18n.getFixedT(specimenLocale, NAMESPACES);
              const rtl = specimenLocale === 'ur-PK';
              return (
                <section
                  key={specimenLocale}
                  lang={specimenLocale}
                  dir={rtl ? 'rtl' : 'ltr'}
                  data-testid={`specimen-${specimenLocale}`}
                  className="space-y-2 rounded-card border border-border p-4"
                  style={rtl ? { lineHeight: 1.9 } : undefined}
                >
                  <h3 className="text-xs font-semibold text-muted">{`${LOCALE_META[specimenLocale].nativeName} · ${rtl ? 'Noto Naskh Arabic · Gulzar' : 'Geist · Newsreader'}`}</h3>
                  <p className="text-2xl font-semibold text-text">{ft('lab:tokens.specimenHeading')}</p>
                  <p className="text-base text-text">{ft('lab:tokens.specimenBody')}</p>
                  <p className="text-sm text-muted">{`${ft('status:evidence.under_review')} · ${ft('status:unit.available')} · ${ft('forms:fields.cnic')}`}</p>
                </section>
              );
            })}
          </div>
        </Panel>

        <div className="grid gap-6 @container lg:grid-cols-2">
          <Panel title={t('lab:tokens.spacing')}>
            <ul className="space-y-2">
              {SPACING.map((px) => (
                <li key={px} className="flex items-center gap-3 text-xs text-muted">
                  <span className="w-10 tabular" dir="ltr">
                    {`${px}px`}
                  </span>
                  <span className="h-3 rounded-sm bg-primary" style={{ inlineSize: px * 2 }} />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={t('lab:tokens.radius')}>
            <div className="flex flex-wrap gap-4">
              {RADII.map((r) => (
                <div key={r} className="flex flex-col items-center gap-2 text-xs text-muted">
                  <span className="size-16 border-2 border-border-control bg-sunken" style={{ borderRadius: `var(--radius-${r})` }} />
                  <span dir="ltr">{`--radius-${r}`}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
