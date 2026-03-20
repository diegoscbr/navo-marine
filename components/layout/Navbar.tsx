'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/Button'

const navLinks = [
  { label: 'Products', href: '/products' },
  { label: 'Capabilities', href: '/capabilities' },
  { label: 'Packages', href: '/packages' },
  { label: 'Contact', href: '/contact' },
]

export function Navbar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [scrolled, setScrolled] = useState(() =>
    typeof window !== 'undefined' ? window.scrollY > 20 : false
  )

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        scrolled ? 'bg-navy-900/95 backdrop-blur-md shadow-lg' : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center" aria-label="NAVO Marine Technologies — home">
          <Image
            src="/logos/transparent_background_logo.png"
            alt=""
            aria-hidden={true}
            width={120}
            height={32}
            priority
          />
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex items-center py-3 px-1 text-sm text-white/70 transition-colors hover:text-white"
                aria-current={pathname === link.href ? 'page' : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/reserve"
              className="inline-flex items-center py-3 px-1 text-sm text-white/70 transition-colors hover:text-white"
              aria-current={pathname === '/reserve' ? 'page' : undefined}
            >
              Reserve
            </Link>
          </li>
        </ul>

        {session?.user ? (
          <div className="flex items-center gap-3">
            {session.user.image && (
              <Image
                src={session.user.image}
                alt={session.user.name ?? ''}
                width={32}
                height={32}
                className="rounded-full"
              />
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="glass-btn glass-btn-ghost inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium tracking-wide"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <Button variant="ghost" href="/login">
            Login
          </Button>
        )}
      </nav>
    </header>
  )
}
