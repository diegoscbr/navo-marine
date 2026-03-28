# Security Review: NAVO Marine

**Date:** 2026-03-28
**Scope:** Full codebase audit — auth, API routes, payments, email, database, secrets

## Executive Summary

The codebase has strong fundamentals: server-side price calculation, Stripe webhook signature verification, idempotent event processing, and consistent admin auth checks. Several areas need attention before production hardening.

---

## CRITICAL

### 1. No Row-Level Security (RLS) on Supabase

**Risk:** If `SUPABASE_SERVICE_ROLE_KEY` leaks or any API route forgets `requireAdmin()`, all data is accessible with zero database-level protection.

**Evidence:** Zero `CREATE POLICY` or `ENABLE ROW LEVEL SECURITY` statements across all 10 migration files. The code comment in `lib/db/client.ts:10` acknowledges this:

> *"CRITICAL: every API route must call requireAuth() or requireAdmin() before using supabaseAdmin. There is no RLS fallback."*

**Recommendation:** Enable RLS on all tables as defense-in-depth. Even basic policies (e.g., `auth.uid() = user_id` for reservations) would prevent catastrophic data exposure if application-level auth is bypassed.

### 2. Email Template HTML Injection

**Risk:** `productName` is interpolated directly into email HTML without sanitization across all 3 templates (`lib/email/templates.ts:36,86,138`). If an admin creates a product with a name containing `<script>` or malicious HTML, it gets rendered in every customer email.

```typescript
<td style="...">${productName}</td>  // No sanitization
```

Also applies to `paymentUrl` in `paymentRequest` template (line 154) — an open redirect/phishing vector if the URL is ever derived from user input.

**Recommendation:** HTML-escape all interpolated values:

```typescript
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
```

---

## HIGH

### 3. No Security Headers

**Risk:** Missing CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy. The site is vulnerable to clickjacking and has no script-source restrictions.

**Evidence:** `next.config.ts` only configures image optimization — no `headers()` function.

**Recommendation:** Add security headers in `next.config.ts`:

```typescript
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ],
  }]
}
```

### 4. Webhook Error Leaks Verification Details

**Risk:** The Stripe webhook route (`app/api/webhooks/stripe/route.ts:32`) returns the exact verification failure reason to the caller:

```typescript
{ error: `Webhook signature verification failed: ${message}` }
```

This helps attackers probe signature bypass techniques.

**Recommendation:** Return a generic `400 Bad Request` with no details. Log the specifics server-side only.

### 5. Admin API Routes Leak Database Error Messages

**Risk:** Multiple admin routes return `error.message` directly from Supabase, which can expose table names, constraint names, and schema details.

**Affected routes:** events, units, reservations (at least 8 instances across admin API).

**Recommendation:** Replace `{ error: error.message }` with `{ error: 'Operation failed' }` and `console.error()` the full details.

### 6. No Input Validation Schemas on Admin Routes

**Risk:** Admin routes accept `req.json()` with TypeScript type assertions but no runtime validation. Invalid data shapes, wrong types, or extra fields pass through unchecked.

**Key gaps:**

- Unit status accepts any string (no enum whitelist)
- Event PATCH accepts any partial fields without date validation
- Unit POST doesn't validate `product_id` exists
- `assign-units` doesn't validate individual assignment structure

**Recommendation:** Add Zod schemas for admin route bodies.

### 7. No Rate Limiting

**Risk:** No rate limiting on any endpoint. The checkout endpoint is particularly sensitive — an attacker could create thousands of Stripe sessions or flood the invoice-send endpoint.

**Recommendation:** Add rate limiting at minimum on:

- `/api/checkout` (expensive — creates Stripe sessions)
- `/api/admin/reservations/[id]/send-invoice` (triggers external email)
- `/api/webhooks/stripe` (already has signature verification, but adds defense-in-depth)

---

## MEDIUM

### 8. Non-null Assertions on Environment Variables

**Risk:** `process.env.STRIPE_SECRET_KEY!` and similar patterns (`lib/stripe/client.ts:3`, `lib/db/client.ts:17-19`) will cause opaque runtime crashes if variables are missing, rather than failing fast with clear messages.

**Recommendation:** Validate required env vars at startup:

```typescript
if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is required')
```

### 9. Duplicated `requireAdmin()` Across Admin Routes

**Risk:** 8 of 10 admin route files define their own inline `requireAdmin()` function instead of using the centralized `lib/auth-guard.ts`. If the domain check logic changes (e.g., adding role-based access), you'd need to update 8+ files.

**Recommendation:** Consolidate all routes to use `import { requireAdmin } from '@/lib/auth-guard'`.

### 10. `console.log` in Production Code

**Evidence:** `lib/checkout/handlers/regatta-package.ts:120` has a `console.log` that logs checkout parameters including product IDs and dates. Not sensitive, but noisy and should use structured logging or be removed.

---

## LOW

### 11. UUID Format Not Validated on Route Parameters

IDs from URL params and request bodies (e.g., `product_id`, `event_id`, `unit_id`) are passed directly to Supabase without format validation. Supabase will return "not found" for invalid UUIDs, so this is not exploitable, but explicit validation would fail faster and produce cleaner error messages.

### 12. Public Products API Has No Auth

`/api/products` is fully public with no auth check. This is likely intentional (storefront data), but confirm no sensitive pricing or internal data is exposed in the response.

---

## What's Working Well

| Area | Status |
|------|--------|
| Stripe webhook signature verification | Correct |
| Idempotent webhook processing (log-after-fulfillment) | Correct |
| Server-side price calculation (never trust client) | Correct |
| All admin routes have auth checks | Correct |
| JWT sessions (stateless, edge-compatible) | Correct |
| Secrets not in git history | Correct |
| `.env` properly gitignored | Correct |
| Parameterized queries (no SQL injection) | Correct |
| Middleware-level route protection | Correct |
| Admin domain gating (`@navomarine.com`) | Correct |

---

## Priority Fix Order

1. Add security headers in `next.config.ts` (quick win)
2. Sanitize email template interpolations (prevents HTML injection)
3. Genericize error messages in webhook + admin routes (prevents info leakage)
4. Add env var validation at startup (prevents opaque crashes)
5. Consolidate `requireAdmin` to single import (reduces maintenance risk)
6. Enable RLS on Supabase tables (defense-in-depth)
7. Add rate limiting on checkout and invoice endpoints
8. Add Zod validation on admin route inputs
