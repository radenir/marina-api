-- 017: seed the "Free (Anonymous)" partner.
--
-- The free, no-login Note Taker now persists its transcript + extracted report
-- like the paid flow, but an anonymous caller has no user_id and no real
-- partner. Rather than change the schema, we own those rows with a single
-- dedicated partner: conversations.partner_id / cases.partner_id point at this
-- row, and the per-install device id (x-marina-device) is stored in
-- partner_user_ref so anonymous sessions stay distinguishable per device.
--
-- This is a data seed, not a structural change — no ALTER, no new column, no
-- constraint touched. The fixed id keeps it stable across environments and lets
-- the API reference it without a lookup (see FREE_ANON_PARTNER_ID in ai.ts).

INSERT INTO partners (id, name, slug)
VALUES ('11111111-1111-4111-8111-111111111111', 'Free (Anonymous)', 'free-anonymous')
ON CONFLICT (slug) DO NOTHING;
