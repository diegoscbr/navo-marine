import type { Metadata } from 'next'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { SignOutButton } from './SignOutButton'

export const metadata: Metadata = {
  title: 'Dashboard | NAVO Marine Technologies',
}

export default async function DashboardPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy-900 px-6 text-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
        {session.user.image && (
          <Image
            src={session.user.image}
            alt={session.user.name ?? ''}
            width={80}
            height={80}
            className="mx-auto mb-6 rounded-full"
          />
        )}
        <h1 className="font-heading text-2xl font-semibold text-white">
          Welcome back, {session.user.name?.split(' ')[0] ?? 'Captain'}
        </h1>
        <p className="mt-2 text-sm text-white/40">{session.user.email}</p>
        <div className="mt-8">
          <SignOutButton />
        </div>
      </div>
    </main>
  )
}
