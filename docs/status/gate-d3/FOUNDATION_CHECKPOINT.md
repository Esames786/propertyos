# Gate D.3 — Foundation checkpoint 0 (code only; tests not executed)

Parent: accepted D.2 closure `a54f594`. Separate branch `feature/gate-d3-community-chat`.

This checkpoint introduces an **isolated pure TypeScript policy layer** and Vitest cases for group membership, join-time history, leave/move-out revocation, queued offline send rejection, tenant-set retention, and held/deleted messages. It deliberately makes **no** production claims and adds no UI, routes, endpoints, fixtures, notifications, mock persistence or licensed modules yet. The existing 27-module catalogue and D.2 demos remain unchanged.

## Next implementation steps
1. Implement module catalogue expansion to `community_chat` and `community_hub` with same-site Rule R, add explicit role permissions and fail-closed typed mock endpoints.
2. Implement dynamic groups from effective-dated occupancy and committee/staff facts; avoid free-form resident-to-resident DMs by default.
3. Implement reporting/moderation, tenant-configured retention (no assumed statutory period), delivery states and offline revocation caveats.
4. Implement three reference UI experiences: office moderation/groups, resident group conversation, resident Community home with optional services/polls. Official D.2 notices must work when both add-ons are removed.
5. Marketplace is OFF by default until D-31 owner choice; SOS remains parked. Never expose resident debts or contact details.
6. Run unit/API, E2E, axe, EN/UR 320/390/1440, 200% zoom, Firefox/WebKit smoke on the final implementation and report actual results.

No backend, no VPS update, no Bingoo changes, no merge into main. This checkpoint does not mark any D.3 screens built.
