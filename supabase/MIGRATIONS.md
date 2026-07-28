# Migration history

## State

All files use the 14-digit timestamp prefix the Supabase CLI requires
(`<version>_<name>.sql`). Before 2026-07-28 they used a 3-digit sequence
(`001_`, `002_`), which the CLI cannot parse as a version — that is why changes
were applied by hand in the dashboard and why the ledger drifted from the repo.

`version` is the only field the CLI matches on. The `name` half is informational,
so historic ledger names still carry their old `002_` style prefixes while the
filenames no longer do. That mismatch is cosmetic.

| File version | Name | In prod ledger |
| --- | --- | --- |
| 20260317053400 | initial_schema | **no — see below** |
| 20260317053439 | admin_product_fields | yes |
| 20260317135646 | seed_atlas2_content | yes |
| 20260320160643 | phase_4_5_schema | yes |
| 20260320161018 | phase_4_5_seed | yes |
| 20260323204845 | reservation_units_unit_id | yes |
| 20260323213258 | reservations_quantity | yes |
| 20260323213300 | reservation_units_slot_integrity | **no — see below** |
| 20260327033248 | fix_cron_reservation_units_cleanup | yes |
| 20260429214808 | pause_expire_unpaid_cron | yes |
| 20260728120000 | fleet_derived_capacity | yes |
| 20260728143000 | restore_product_options | pending |

There is no `004`. There never was.

## Required before any `supabase db push`

Two migrations were applied by hand and never recorded. Their objects exist in
production — `initial_schema`'s tables, and `slot_integrity`'s
`uq_reservation_units_reservation_unit` index plus `assign_reservation_units()`
function, both verified present.

Because the ledger has no row for them, a push would try to **re-run** them.
`initial_schema` uses bare `CREATE TABLE`, so it would fail against existing
tables. Record them as already-applied first:

```sql
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260317053400', 'initial_schema'),
  ('20260323213300', 'reservation_units_slot_integrity')
on conflict (version) do nothing;
```

Also record the products hotfix if it was run through the SQL editor:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20260728143000', 'restore_product_options')
on conflict (version) do nothing;
```

## Replay

`seed_atlas2_content` used to fail on a fresh database. It declares
`p_id := '6f303d86-…'` and inserts `product_box_items`, `product_sections` and
the rest as children of that product — but the `products` row itself was created
by hand and never captured in a migration, so the first foreign key failed and
branch provisioning died there.

It now seeds that row itself, idempotently, using only columns that exist as of
`admin_product_fields`. `category`, `price_per_day_cents`, `capacity`,
`atlas2_units_required` and `tablet_required` are added later by
`phase_4_5_schema` and back-filled for this product by `phase_4_5_seed`, so they
are deliberately absent from the anchor. The internal tablet product is inserted
by `phase_4_5_seed`, not here.

Production is unaffected — that migration already ran there.

## Still only in production

These were made through the dashboard and are not in any migration. A fresh
branch will not have them, which is fine for testing but means production cannot
be rebuilt from this directory alone:

- Both rental events (`Snipe World Championship`, `J24 National Championship`)
  and their `rental_event_products` allocations
- The 62-unit Atlas 2 fleet and 2 tablet units in `units`
- The Snipe capacity edit (40 → 100), now superseded by fleet-derived capacity
- All customer `reservations` and `orders`

Deliberately not captured: reservations and orders contain customer data and do
not belong in the repo.

## Linking the CLI

`supabase/config.toml` is absent, so the CLI is not linked. Generate it rather
than hand-writing it:

```bash
npx supabase link --project-ref fdjuhjadjqkpqnpxgmue
npx supabase migration list   # local vs remote, by version
```

Run the ledger inserts above *before* the first `db push`.
