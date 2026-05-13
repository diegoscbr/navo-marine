import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { UnderwaterCaustics } from '@/components/backgrounds/UnderwaterCaustics'
import { GoogleSignInButton } from './GoogleSignInButton'
import { OrderSummary } from './OrderSummary'
import { decodeSelection, isSafeCallbackUrl } from '@/lib/checkout/state-codec'
import { loadOrderSummary } from '@/lib/checkout/summary'

type SearchParams = Record<string, string | string[] | undefined>

async function decodeCallback(callbackUrl: string | null) {
  if (!callbackUrl || !isSafeCallbackUrl(callbackUrl)) return null
  const queryIdx = callbackUrl.indexOf('?')
  if (queryIdx === -1) return null
  const query = callbackUrl.slice(queryIdx + 1)
  const selection = decodeSelection(new URLSearchParams(query))
  if (!selection) return null
  try {
    const summary = await loadOrderSummary(selection)
    if (!summary) return null
    return { selection, summary, callbackUrl }
  } catch {
    return null
  }
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const params = await searchParams
  const cb = typeof params.callbackUrl === 'string' ? params.callbackUrl : null
  const context = await decodeCallback(cb)
  return {
    title: 'Sign In | NAVO Marine Technologies',
    robots: context ? { index: false, follow: false } : undefined,
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  const params = await searchParams
  const callbackUrlRaw = params.callbackUrl
  const callbackUrl = typeof callbackUrlRaw === 'string' ? callbackUrlRaw : null

  if (session?.user) {
    if (callbackUrl && isSafeCallbackUrl(callbackUrl)) {
      redirect(callbackUrl)
    }
    redirect(session.user.email?.endsWith('@navomarine.com') ? '/admin' : '/')
  }

  const context = await decodeCallback(callbackUrl)

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-navy-900 px-6 py-16">
      <UnderwaterCaustics className="absolute inset-0 z-0" />
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
        <Image
          src="/logos/transparent_background_logo.png"
          alt="NAVO Marine Technologies"
          width={140}
          height={38}
          className="mb-10"
        />

        {context ? (
          <>
            <OrderSummary summary={context.summary} />
            <h1 className="mt-6 font-heading text-2xl font-semibold text-white">
              Sign in to complete your {context.summary.contextLabel.toLowerCase()}
            </h1>
            <p className="mt-2 text-sm text-white/50">
              We use Google sign-in to securely save your reservation. No password needed.
            </p>
            <div className="mt-6">
              <GoogleSignInButton callbackUrl={context.callbackUrl} />
            </div>
            <Link
              href={context.callbackUrl}
              className="mt-6 text-xs text-white/40 transition-colors hover:text-white/70"
            >
              ← Back to {context.summary.callbackUrlPathLabel}
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-heading text-3xl font-semibold text-white">Sign In</h1>
            <p className="mt-3 text-sm text-white/60">
              Sign in to NAVO Marine — manage your reservations and event history.
            </p>
            <p className="mt-1 text-xs text-white/40">
              We use Google sign-in. No password needed.
            </p>
            <div className="mt-8">
              <GoogleSignInButton />
            </div>
            <Link
              href="/products"
              className="mt-8 text-xs text-white/40 transition-colors hover:text-white/70"
            >
              Just exploring? Browse our products →
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
