# NAVO Marine — Rental & Fleet Management Platform

A full-stack booking and fleet management platform built for [NAVO Marine Technologies](https://navomarine.com), a marine technology company that provides GPS tracking hardware (Vakaros Atlas 2) and regatta management services to competitive sailors.

## What It Does

**For customers:**
- Browse and purchase marine GPS hardware
- Reserve Atlas 2 units for regattas and sailing events
- Book custom date rentals and regatta management packages
- Secure checkout with Stripe payment processing
- Automated confirmation emails at every step

**For admins:**
- Manage reservations with real-time status tracking
- Assign fleet units to bookings (43-unit fleet with overlap detection)
- Create events that auto-link to rental products with calculated pricing
- Send payment invoices to customers with one click
- Delete and manage reservations with eligibility gating
- Full fleet visibility — unit status, assignment history, availability

**Automated operations:**
- Stripe webhook fulfillment (payment verification, order creation)
- Email notifications (booking received, payment confirmed, invoice requests)
- Reservation expiration (auto-cancel unpaid bookings, free blocked units)
- Inventory management (unit availability, date-range overlap detection)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4, Framer Motion |
| Auth | NextAuth v5 (Google OAuth, JWT) |
| Database | Supabase (PostgreSQL) |
| Payments | Stripe (Checkout Sessions, Webhooks) |
| Email | Gmail API (service account, domain-wide delegation) |
| Hosting | Vercel (Production + Preview) |
| Testing | Jest, React Testing Library, Playwright |

## Architecture Highlights

- **JWT auth with edge middleware** — route protection runs at the CDN edge, no database round-trip for auth checks
- **Service role data layer** — all database operations go through a server-side Supabase client with explicit auth gating per route (no RLS dependency)
- **Type-safe checkout dispatch** — four reservation types (rental event, rental custom, regatta package, purchase) each with dedicated handlers, pricing logic, and Stripe session configuration
- **Status-aware availability** — fleet unit availability queries join against reservation status to prevent stale cancelled bookings from blocking inventory
- **Atomic webhook fulfillment** — Stripe event deduplication, idempotent order creation, and automated email dispatch
- **PL/pgSQL cron jobs** — hourly expiration of unpaid reservations with automatic unit cleanup

## Project Structure

```
app/
  admin/           Admin dashboard (reservations, events, fleet)
  api/             API routes (checkout, webhooks, admin CRUD)
  products/        Storefront product pages
  reserve/         Booking UI
  packages/        Package browsing

lib/
  auth.ts          NextAuth config (Node.js runtime)
  auth.config.ts   Edge-safe auth config (middleware)
  db/              Supabase repositories (client, products, packages, events, availability)
  checkout/        Per-type checkout handlers
  stripe/          Stripe client + webhook fulfillment
  email/           Gmail API sender + HTML templates
  admin/           Unit availability filtering

components/
  layout/          Navbar (responsive with mobile hamburger menu)
  sections/        Landing page sections
  ui/              Shared UI components

supabase/
  migrations/      SQL migrations (001–010)
```

## Development

```bash
npm install        # Install dependencies
npm run dev        # Dev server at http://localhost:3000
npm run build      # Production build
npm test           # Jest unit tests
npm run test:e2e   # Playwright E2E tests
npm run lint       # ESLint
```

## License

Proprietary — source available for portfolio and educational reference only. See [LICENSE](./LICENSE) for details.

Built by [Diego Escobar](https://github.com/diegoscbr). NAVO Marine Technologies holds an exclusive use license.
