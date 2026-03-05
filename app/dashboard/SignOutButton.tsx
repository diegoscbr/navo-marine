'use client'

import { signOut } from 'next-auth/react'

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-medium text-white/70 transition-colors hover:border-white/40 hover:text-white"
    >
      Sign Out
    </button>
  )
}
