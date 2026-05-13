'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { signOut } from 'next-auth/react'

interface Props {
  name: string | null | undefined
  email: string | null | undefined
  image: string | null | undefined
}

export function AccountMenu({ name, email, image }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const displayName = name ?? email ?? 'Account'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-white/10 transition-all hover:ring-white/30"
      >
        {image ? (
          <Image src={image} alt="" width={32} height={32} className="rounded-full" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-marine-500 text-sm font-medium text-white">
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-white/10 bg-navy-900/95 backdrop-blur-md shadow-2xl">
          <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
            {image ? (
              <Image src={image} alt="" width={40} height={40} className="rounded-full" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-marine-500 text-base font-medium text-white">
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              {name && <p className="truncate text-sm font-medium text-white">{name}</p>}
              {email && <p className="truncate text-xs text-white/50">{email}</p>}
            </div>
          </div>
          <ul className="py-1">
            <li>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  signOut({ callbackUrl: '/' })
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z"
                    clipRule="evenodd"
                  />
                  <path
                    fillRule="evenodd"
                    d="M19 10a.75.75 0 00-.22-.53l-2.5-2.5a.75.75 0 10-1.06 1.06l1.22 1.22H9a.75.75 0 000 1.5h7.44l-1.22 1.22a.75.75 0 101.06 1.06l2.5-2.5A.75.75 0 0019 10z"
                    clipRule="evenodd"
                  />
                </svg>
                Sign out
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
