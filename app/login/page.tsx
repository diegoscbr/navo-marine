import type { Metadata } from 'next'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { GoogleSignInButton } from './GoogleSignInButton'

export const metadata: Metadata = {
  title: 'Login | NAVO Marine Technologies',
}

export default async function LoginPage() {
  const session = await auth()

  if (session) {
    redirect('/dashboard')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy-900 px-6 text-center">
      <Image
        src="/logos/transparent_background_logo.png"
        alt="NAVO Marine Technologies"
        width={140}
        height={38}
        className="mb-12"
      />
      <h1 className="text-3xl font-semibold text-white">Sign In</h1>
      <p className="mt-4 mb-8 text-white/40">
        Sign in to access your NAVO dashboard.
      </p>
      <GoogleSignInButton />
    </main>
  )
}
