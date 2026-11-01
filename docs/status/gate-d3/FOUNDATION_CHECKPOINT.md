# Gate D.3 — Checkpoint 1 (staged licensing and smart-group foundation)

Branch: `feature/gate-d3-community-chat`. Base: accepted D.2 `a54f594`.

## Added in code
- `community_chat` and `community_hub` module keys, site-scope grants, optional catalogue add-ons and permissions. Existing presets **do not** activate them.
- Administrator/manager role permission declarations (grants still enforce licence separately).
- Smart site/block/floor groups derived from effective-dated occupant facts. Pure resident-facing lists contain no identities or debt.
- A reusable dual-entitlement policy: verified resident portal at the same site **and** separately licensed add-on with scope/feature checks. Tests cover missing licence, cross-site, move-out, suspension, missing feature.
- Earlier policy layer: joined-at history boundary, revocation and queued-send refusal, configured retention.

## Still not implemented
No complete UI/Chat APIs/persistence, group conversation, moderation, services, polling, marketplace or dynamically configured retention page yet. No D.3 screen may be marked BUILT based on this checkpoint.

## Test limitation
These TypeScript tests were written and committed through the GitHub connector, **not executed** in a locally installed repository environment. A complete build and tests are mandatory before integration or owner sign-off. This is a **code checkpoint only**, not Gate D.3 completion.

## Safety boundaries
No existing tenant is newly granted chat or hub. No changes to `main`, live preview, Nginx, Laravel, production databases, Bingoo, SOS or financial settlement.
