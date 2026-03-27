# Eng Review - 2026-03-26 V1 Hardening Plan

Reviewed plan: `docs/superpowers/plans/2026-03-26-v1-hardening-plan.md`

Mode: engineering-manager review, biased toward boring technology, minimal diff, and strong test coverage.

---

## Verdict

Clear this plan.

It is the right level of hardening for the current system: it fixes correctness under horizontal scale without inventing a new platform. The plan stays focused on DB invariants, write paths, and tests, which is exactly where the real risk is.

---

## Step 0 Findings

### Existing code reuse

Good call keeping:

- existing checkout routes and handler structure
- existing Stripe Checkout integration
- existing `pg_cron` cleanup model
- existing Supabase-backed reservation/order schema

The plan improves the fragile parts instead of replacing them.

### Scope discipline

The first draft could have sprawled into:

- RLS
- caching
- admin UX cleanup
- infra/process work

The final plan correctly rejects that sprawl. That is the right decision for this branch and traffic profile.

### Complexity check

The plan still touches many files, but the complexity is essential rather than accidental:

- 3 migrations
- 4 checkout/webhook write paths
- 1 admin assignment path
- focused test expansion

That is acceptable because the invariant changes belong close to the code they protect.

### TODOS cross-reference

The plan correctly absorbs the TODOs that are really architecture issues:

- package assignment correctness
- webhook duplicate safety
- package overlap cleanup

And it correctly leaves shipping, pagination, KPI work, and UI polish out of scope.

---

## Findings

### 1. High: `stripe_events` should not become the primary idempotency lock

Recommendation: keep `stripe_events` as audit history and make `orders` / `reservations` uniqueness the real safety net.

Why:

- claiming webhook events early creates a retry-state problem when fulfillment fails midway
- DB uniqueness on `orders(reservation_id)` and `orders(stripe_checkout_session_id)` is simpler and more reversible
- this matches the "boring by default" rule for a small system

Status: applied in the plan.

### 2. High: package assignment needs server-side overlap validation, not just filtered dropdowns

Recommendation: validate overlap conflicts in the RPC and keep UI filtering only as convenience.

Why:

- UI state is stale by definition under concurrent admin activity
- overlapping physical-unit assignment is a data integrity bug, not just a UX bug
- the DB already has the date ranges needed to reject conflicts

Status: applied in the plan.

### 3. Medium: Phase 1 must stay narrowly scoped to correctness, not read performance

Recommendation: defer caching, pagination, KPI work, and full RLS.

Why:

- current traffic does not justify them
- they do not solve the primary failure modes
- bundling them into this pass would increase review and rollout risk

Status: applied in the plan.

---

## Architecture Review

### What is strong

- The plan keeps the current deployment model.
- It moves concurrency-sensitive logic into Postgres transactions, where it belongs.
- It uses explicit RPCs per reservation type rather than a generic reservation framework.
- It separates pre-launch hardening from post-launch cleanup.

### Failure scenario check

If two users hit the same package inventory at nearly the same moment:

- old system: both can pass availability checks and both can insert
- planned system: one transaction acquires the lock, the second recomputes after the first commit and fails cleanly

That is the right behavior and the plan accounts for it.

---

## Code Quality Review

### Recommendation

Stay explicit.

Do not introduce:

- a generic "inventory service"
- a generic "reservation engine"
- a single mega-RPC for all reservation types

Three explicit RPCs are easier to review, test, and debug than one abstraction-heavy path.

---

## Test Review

The plan is strong here. The required tests are the right ones:

- concurrent reservation creation
- duplicate webhook replay
- package expiry cleanup
- admin overlap rejection
- DB-backed purchase pricing

This is the correct test bar for launch hardening.

---

## Performance Review

At the expected traffic level, performance is not the limiting factor.

The plan is right to:

- add the indexes that support overlap/uniqueness checks
- defer caching and read-path tuning
- avoid new infrastructure

Correctness first is the right tradeoff here.

---

## Final Recommendation

Implement this plan in order:

1. keys and indexes
2. lifecycle cleanup
3. atomic reservation RPCs
4. webhook hardening
5. admin assignment hardening
6. purchase source-of-truth cleanup if time permits

The plan is engineered enough, not over-engineered, and worth implementing as written.
