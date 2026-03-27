# Fix Stale reservation_units Blocking Package Availability

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent cancelled/expired reservations from permanently blocking package unit availability by cleaning up `reservation_units` rows in the cron job and making the availability query status-aware.

**Architecture:** Two changes: (1) a new migration replacing `expire_unpaid_reservations()` to also delete `reservation_units` for expiring reservations, (2) modify `checkMultiUnitAvailability()` to join `reservation_units` against `reservations` and only count active statuses.

**Tech Stack:** PostgreSQL (PL/pgSQL), Supabase, TypeScript, Jest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/010_fix_cron_reservation_units_cleanup.sql` | Create | Replace `expire_unpaid_reservations()` to delete reservation_units before cancelling |
| `lib/db/packages.ts` | Modify | Make `checkMultiUnitAvailability()` status-aware by joining to reservations |
| `__tests__/lib/db/packages.test.ts` | Modify | Add tests for status-aware availability filtering |

---

## Task 1: Migration — clean up reservation_units in cron job

### Files:
- Create: `supabase/migrations/010_fix_cron_reservation_units_cleanup.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/010_fix_cron_reservation_units_cleanup.sql`:

```sql
-- Fix: expire_unpaid_reservations() now deletes reservation_units rows
-- for expiring reservations before cancelling them.
--
-- Without this, expired unpaid reservations leave stale reservation_units
-- rows that permanently block package unit availability in
-- checkMultiUnitAvailability().
--
-- The reservation_units table also has ON DELETE CASCADE from
-- migrations/005, so admin DELETE already works. This fix addresses
-- the cron expiry path only.

CREATE OR REPLACE FUNCTION expire_unpaid_reservations()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, unit_id, customer_email, user_id
    FROM reservations
    WHERE status = 'reserved_unpaid' AND expires_at < now()
  LOOP
    -- Delete reservation_units rows so they no longer block availability
    DELETE FROM reservation_units WHERE reservation_id = r.id;

    UPDATE reservations
    SET status = 'cancelled', updated_at = now()
    WHERE id = r.id;

    IF r.unit_id IS NOT NULL THEN
      UPDATE units SET status = 'available' WHERE id = r.unit_id;
      INSERT INTO unit_events (unit_id, event_type, from_status, to_status, actor_type, notes)
      VALUES (r.unit_id, 'status_changed', 'reserved_unpaid', 'available', 'system',
              'Reservation expired after 24 hours');
    END IF;

    INSERT INTO notifications (user_id, message, link)
    VALUES (r.user_id, 'Your reservation expired. Book again anytime.', '/reserve');
  END LOOP;
END;
$$;
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase MCP or dashboard SQL editor:

```bash
# Via MCP (preferred):
# Use mcp__supabase__apply_migration with the SQL content

# Via dashboard:
# Paste the SQL into https://supabase.com/dashboard/project/fdjuhjadjqkpqnpxgmue/sql
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/010_fix_cron_reservation_units_cleanup.sql
git commit -m "fix: cron expiry now deletes reservation_units to unblock availability"
```

---

## Task 2: Make checkMultiUnitAvailability status-aware

### Files:
- Modify: `lib/db/packages.ts:99-136`
- Modify: `__tests__/lib/db/packages.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to `__tests__/lib/db/packages.test.ts` inside the `checkMultiUnitAvailability` describe block:

```typescript
it('excludes reservation_units whose parent reservation is cancelled', async () => {
  const calls = [
    { count: 10, error: null }, // atlas2 total
    { count: 2, error: null },  // tablet total
  ]
  let fromCallCount = 0

  ;(mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'units') {
      const result = calls[fromCallCount++]
      return makeChain({ gte: jest.fn().mockResolvedValue(result) })
    }
    if (table === 'reservation_units') {
      // Return a chain that ultimately resolves with rows that include
      // a joined reservation status. The implementation should filter these out.
      return makeChain({
        gte: jest.fn().mockResolvedValue({
          data: [
            { quantity: 1, reservations: { status: 'cancelled' } },
            { quantity: 1, reservations: { status: 'reserved_paid' } },
          ],
          error: null,
        }),
      })
    }
    return makeChain()
  })

  const { checkMultiUnitAvailability } = await import('@/lib/db/packages')
  const result = await checkMultiUnitAvailability('product-uuid', '2027-06-01', '2027-06-05', 5, true)

  // Only the reserved_paid row should count (1 allocated), so 10 - 1 = 9 available >= 5 needed
  expect(result.available).toBe(true)
})

it('counts reservation_units for paid reservations even with past expires_at', async () => {
  const calls = [
    { count: 5, error: null }, // atlas2 total (only 5)
    { count: 2, error: null }, // tablet total
  ]
  let fromCallCount = 0

  ;(mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'units') {
      const result = calls[fromCallCount++]
      return makeChain({ gte: jest.fn().mockResolvedValue(result) })
    }
    if (table === 'reservation_units') {
      // Paid reservation with old expires_at — MUST still count as allocated
      return makeChain({
        gte: jest.fn().mockResolvedValue({
          data: [
            { quantity: 1, reservations: { status: 'reserved_paid' } },
            { quantity: 1, reservations: { status: 'reserved_paid' } },
            { quantity: 1, reservations: { status: 'reserved_paid' } },
          ],
          error: null,
        }),
      })
    }
    return makeChain()
  })

  const { checkMultiUnitAvailability } = await import('@/lib/db/packages')
  const result = await checkMultiUnitAvailability('product-uuid', '2027-06-01', '2027-06-05', 5, true)

  // 3 paid allocations, only 5 total → 2 available < 5 needed
  expect(result.available).toBe(false)
  expect(result.reason).toMatch(/atlas 2/i)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --runTestsByPath __tests__/lib/db/packages.test.ts --no-coverage`
Expected: The two new tests FAIL — current implementation does not join to reservations or filter by status.

- [ ] **Step 3: Implement status-aware availability in checkMultiUnitAvailability**

In `lib/db/packages.ts`, replace the atlas2 allocation query (lines 99-110):

```typescript
  // 3. Atlas 2 units already allocated for overlapping date range
  // Join to reservations to exclude cancelled/expired rows.
  const { data: atlas2AllocatedRows, error: allocErr } = await supabaseAdmin
    .from('reservation_units')
    .select('quantity, reservations!inner(status)')
    .eq('unit_type', 'atlas2')
    .in('reservations.status', ['reserved_unpaid', 'reserved_authorized', 'reserved_paid'])
    .lte('start_date', endDate)
    .gte('end_date', startDate)

  if (allocErr) throw new Error(`checkMultiUnitAvailability: ${allocErr.message}`)

  const atlas2Allocated = ((atlas2AllocatedRows ?? []) as { quantity: number | null }[])
    .reduce((sum, row) => sum + (row.quantity ?? 1), 0)
  const atlas2Available = (atlas2Total ?? 0) - atlas2Allocated
```

And replace the tablet allocation query (lines 123-136):

```typescript
  // 4. Tablet units already allocated for overlapping date range (only if needed)
  let tabletAllocated = 0
  if (tabletRequired) {
    const { data: tabAllocRows, error: tabAllocErr } = await supabaseAdmin
      .from('reservation_units')
      .select('quantity, reservations!inner(status)')
      .eq('unit_type', 'tablet')
      .in('reservations.status', ['reserved_unpaid', 'reserved_authorized', 'reserved_paid'])
      .lte('start_date', endDate)
      .gte('end_date', startDate)
    if (tabAllocErr) throw new Error(`checkMultiUnitAvailability: ${tabAllocErr.message}`)
    tabletAllocated = ((tabAllocRows ?? []) as { quantity: number | null }[])
      .reduce((sum, row) => sum + (row.quantity ?? 1), 0)
  }
```

Remove the two `NOTE:` comments about the cancellation gap (lines 100-102 and 124-125) — they're no longer accurate.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --runTestsByPath __tests__/lib/db/packages.test.ts --no-coverage`
Expected: ALL tests pass (existing + 2 new).

- [ ] **Step 5: Update existing checkMultiUnitAvailability tests for new query shape**

The existing tests mock `reservation_units` queries returning `{ data: [], error: null }`. With the new `!inner` join, the mock chain needs to handle the `.in()` call. Update the existing test mocks if any fail due to the new `.in()` call in the chain.

Check: if all tests pass after Step 4, skip this step.

- [ ] **Step 6: Lint**

Run: `npx eslint lib/db/packages.ts`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add lib/db/packages.ts __tests__/lib/db/packages.test.ts
git commit -m "fix: checkMultiUnitAvailability filters by active reservation status"
```

---

## Verification

After all tasks are complete:

```bash
# Run all package tests
npx jest --runTestsByPath __tests__/lib/db/packages.test.ts --no-coverage

# Lint
npx eslint lib/db/packages.ts

# Verify migration file exists and is valid SQL
cat supabase/migrations/010_fix_cron_reservation_units_cleanup.sql
```

### Manual verification on staging (after migration is applied):
1. Create a reservation via `/reserve` → don't complete payment → wait for it to expire (or manually set `expires_at` to the past and trigger the cron function via `SELECT expire_unpaid_reservations()`)
2. Verify `reservation_units` rows for that reservation are deleted
3. Verify the units now show as available for a new package booking
