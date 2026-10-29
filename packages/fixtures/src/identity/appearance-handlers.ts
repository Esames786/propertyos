import type { OrgAppearanceSettings, OrgPaletteKey, UpdateOrgAppearanceInput } from '@repo/contracts';
import { checkBrand } from '@repo/tokens/brand';
import { decide } from '@repo/contracts';
import { invalid, requires, type Handler, type HandlerContext } from '../handler-types';
import { problem } from '../society/handlers';
import { identityOf, nowStamp } from './state';

/**
 * The organisation's colours (ADM-022, Gate D.1). Every signed-in person reads them (they colour the
 * interface); changing them needs `admin.branding`. A preset palette is open to every organisation; a
 * custom brand colour needs the white-label add-on and must pass the platform's guardrails (every
 * contrast pair, light and dark). People's own palette and high contrast always win over these.
 */
const PALETTES: readonly OrgPaletteKey[] = ['evergreen', 'ocean', 'indigo', 'warm', 'brand'];

const whiteLabel = (ctx: HandlerContext) => !!ctx.access && decide(ctx.access, { module: 'white_label', at: ctx.at, suspension: 'history_read' }).allowed;

function settingsOf(ctx: HandlerContext): OrgAppearanceSettings {
  const a = identityOf(ctx).appearance;
  const brand = a?.palette === 'brand' && a.brandPrimary ? checkBrand(a.brandPrimary) : undefined;
  return {
    palette: a ? (a.palette === 'brand' && !(brand?.ok && whiteLabel(ctx)) ? 'evergreen' : a.palette) : 'evergreen',
    ...(brand?.ok && whiteLabel(ctx) ? { brand: brand.colours } : {}),
    whiteLabel: whiteLabel(ctx),
    ...(a ? { updatedAt: a.updatedAt, updatedByName: a.updatedByName } : {}),
  };
}

export const APPEARANCE_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/org\/appearance$/,
    access: requires('core', 'signed_in', 'history_read'),
    handle: (ctx): OrgAppearanceSettings & { chosen: boolean } => ({ ...settingsOf(ctx), chosen: !!identityOf(ctx).appearance }),
  },
  {
    method: 'PATCH',
    pattern: /^\/org\/appearance$/,
    access: requires('core', 'admin.branding', 'operational'),
    handle: (ctx): OrgAppearanceSettings & { chosen: boolean } => {
      const input = (ctx.req.body ?? {}) as UpdateOrgAppearanceInput;
      if (!PALETTES.includes(input.palette)) invalid(ctx, 'palette', 'forms:errors.selectOne');
      const state = identityOf(ctx);
      let brandPrimary: string | undefined;
      if (input.palette === 'brand') {
        if (!whiteLabel(ctx)) problem(ctx, 403, 'feature_not_licensed', 'identity:appearance.errors.whiteLabel');
        const check = checkBrand(String(input.brandPrimary ?? ''));
        if (!check.ok) {
          problem(ctx, 422, 'brand_contrast', 'identity:appearance.errors.contrast', {
            brandPrimary: [{ code: 'identity:appearance.errors.contrastField', params: { failures: check.failures.join(', '), ...(check.suggestion ? { suggestion: check.suggestion } : {}) } }],
          });
        }
        brandPrimary = check.colours.primary;
      }
      state.appearance = { palette: input.palette, ...(brandPrimary ? { brandPrimary } : {}), updatedAt: nowStamp(ctx), updatedByName: ctx.persona!.displayName };
      ctx.demo.save();
      return { ...settingsOf(ctx), chosen: true };
    },
  },
];
