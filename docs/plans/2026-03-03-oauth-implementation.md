# OAuth 2.0 Implementation Plan — Google Provider

**Date:** 2026-03-03
**Scope:** Full authentication system — Google OAuth 2.0, protected pages, user accounts with database persistence, and API route protection.

---

## Current State

- **Next.js 16** (App Router), TypeScript, Tailwind CSS v4
- No auth libraries, no database, no API routes
- Placeholder `/login` page exists (`app/login/page.tsx`)
- Root layout in `app/layout.tsx` with no session/provider wrapping

---

## Technology Choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Auth library | **Auth.js v5** (`next-auth@5`) | De-facto standard for Next.js App Router; built-in Google provider, JWT & DB sessions, middleware support |
| Database ORM | **Prisma** | First-class Auth.js adapter, type-safe, great DX, migration system |
| Database | **SQLite** (dev) / **PostgreSQL** (prod) | SQLite for zero-config local dev; easy swap to Postgres via `DATABASE_URL` |
| Session strategy | **Database sessions** | Required for user accounts, revocation, and linking OAuth profiles |

---

## Phase 1 — Install Dependencies & Configure Prisma

### 1.1 Install packages

```bash
npm install next-auth@5 @auth/prisma-adapter prisma @prisma/client
```

### 1.2 Initialize Prisma

```bash
npx prisma init --datasource-provider sqlite
```

This creates `prisma/schema.prisma` and a `.env` file with `DATABASE_URL`.

### 1.3 Define Prisma schema

**File:** `prisma/schema.prisma`

Add the Auth.js required models: `User`, `Account`, `Session`, `VerificationToken`. These are the standard models from the Auth.js Prisma adapter docs.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

### 1.4 Run initial migration

```bash
npx prisma migrate dev --name init
```

### 1.5 Create Prisma client singleton

**File:** `lib/prisma.ts`

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

---

## Phase 2 — Auth.js Configuration

### 2.1 Create environment variables

**File:** `.env` (add to existing, created by Prisma init)

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="<generate-with: npx auth secret>"
AUTH_GOOGLE_ID="<your-google-client-id>"
AUTH_GOOGLE_SECRET="<your-google-client-secret>"
```

**File:** `.env.example` (commit-safe reference)

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET=""
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
```

### 2.2 Create Auth.js config

**File:** `lib/auth.ts`

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
```

### 2.3 Create API route handler

**File:** `app/api/auth/[...nextauth]/route.ts`

```ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

---

## Phase 3 — Middleware for Route Protection

### 3.1 Create middleware

**File:** `middleware.ts` (project root)

```ts
import { auth } from "@/lib/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isProtected = req.nextUrl.pathname.startsWith("/dashboard");

  if (isProtected && !isLoggedIn) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

This protects all `/dashboard/*` routes. Add more paths to `matcher` as needed (e.g., `/admin/:path*`, `/reserve/:path*`).

---

## Phase 4 — UI: Login Page & Session Provider

### 4.1 Session provider wrapper

**File:** `components/providers/SessionProvider.tsx`

```tsx
"use client";

import { SessionProvider } from "next-auth/react";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

### 4.2 Wrap root layout

**File:** `app/layout.tsx` — wrap `{children}` with `<AuthProvider>`.

### 4.3 Update login page

**File:** `app/login/page.tsx`

Replace the placeholder with a real Google sign-in button using `signIn("google")` from `next-auth/react`. Style it to match the dark-mode brand (Deep Navy background, Electric Marine Blue accent).

### 4.4 Add sign-out & user avatar to Navbar

Update the Navbar component to conditionally show:
- **Logged out:** "Sign In" link → `/login`
- **Logged in:** User avatar/name + "Sign Out" button

Use `useSession()` on the client or `auth()` on the server to get session state.

---

## Phase 5 — Protected Dashboard Page (Skeleton)

### 5.1 Create dashboard layout

**File:** `app/dashboard/layout.tsx`

Server component that calls `auth()` and redirects if no session (belt-and-suspenders with middleware).

### 5.2 Create dashboard page

**File:** `app/dashboard/page.tsx`

Simple authenticated page showing:
- User name, email, avatar from session
- "Welcome back" message
- Sign out button

This serves as the landing page after login and can be expanded later.

---

## Phase 6 — API Route Protection

### 6.1 Auth helper for API routes

**File:** `lib/auth-guard.ts`

```ts
import { auth } from "./auth";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session;
}
```

### 6.2 Example protected API route

Any future API route can use:

```ts
import { requireAuth } from "@/lib/auth-guard";

export async function POST(req: Request) {
  const session = await requireAuth();
  // session.user.id is available
  // ... handle request
}
```

---

## Phase 7 — Google Cloud Console Setup (Manual)

These steps are performed in the Google Cloud Console (not code):

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Set application type to **Web application**
6. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
7. For production, also add: `https://navomarine.com/api/auth/callback/google`
8. Copy the **Client ID** and **Client Secret** into `.env`

---

## Phase 8 — `.gitignore` & Security

Ensure these entries exist in `.gitignore`:

```
.env
.env.local
prisma/dev.db
prisma/dev.db-journal
```

---

## File Tree (New & Modified Files)

```
navo-marine/
├── .env                              # NEW — secrets (gitignored)
├── .env.example                      # NEW — commit-safe reference
├── middleware.ts                      # NEW — route protection
├── prisma/
│   └── schema.prisma                 # NEW — database schema
├── lib/
│   ├── auth.ts                       # NEW — Auth.js config
│   ├── auth-guard.ts                 # NEW — API route helper
│   └── prisma.ts                     # NEW — Prisma singleton
├── components/
│   └── providers/
│       └── SessionProvider.tsx        # NEW — client session provider
├── app/
│   ├── layout.tsx                    # MODIFIED — wrap with SessionProvider
│   ├── login/
│   │   └── page.tsx                  # MODIFIED — real Google sign-in
│   ├── dashboard/
│   │   ├── layout.tsx                # NEW — auth-gated layout
│   │   └── page.tsx                  # NEW — authenticated dashboard
│   └── api/
│       └── auth/
│           └── [...nextauth]/
│               └── route.ts          # NEW — Auth.js API handler
```

---

## Execution Order

| Step | Phase | Description |
|------|-------|-------------|
| 1 | Phase 1 | Install deps, init Prisma, create schema, run migration |
| 2 | Phase 2 | Create `.env`, `lib/auth.ts`, `lib/prisma.ts`, API route |
| 3 | Phase 3 | Add `middleware.ts` for route protection |
| 4 | Phase 4 | SessionProvider, update layout, login page, navbar |
| 5 | Phase 5 | Create `/dashboard` with auth gating |
| 6 | Phase 6 | API auth guard utility |
| 7 | Phase 7 | Google Cloud Console setup (manual, by you) |
| 8 | Phase 8 | Verify `.gitignore`, security audit |

---

## Post-Implementation Verification

- [ ] `npm run build` succeeds
- [ ] Visiting `/dashboard` while logged out redirects to `/login`
- [ ] Clicking "Sign in with Google" starts the OAuth flow
- [ ] After sign-in, user lands on `/dashboard` with their profile visible
- [ ] User record is created in the SQLite database
- [ ] Sign out works and clears the session
- [ ] API routes return 401 when called without a session
