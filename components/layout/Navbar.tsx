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
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
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

        {/* Desktop auth */}
        <div className="hidden md:flex items-center gap-3">
          {session?.user ? (
            <>
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
                className="glass-btn glass-btn-ghost inline-flex items-center justify-center px-6 py-3 text-sm font-medium tracking-wide"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Button variant="ghost" href="/login">
              Login
            </Button>
          )}
        </div>

        {/* Mobile hamburger button */}
        <button
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          className="md:hidden rounded p-2 text-white/70 transition-colors hover:text-white"
        >
          <span className={`block h-0.5 w-5 bg-current transition-all duration-300 ${mobileOpen ? 'translate-y-1.5 rotate-45' : ''}`} />
          <span className={`block h-0.5 w-5 bg-current transition-all duration-300 ${mobileOpen ? 'opacity-0' : 'mt-1'}`} />
          <span className={`block h-0.5 w-5 bg-current transition-all duration-300 ${mobileOpen ? '-translate-y-1.5 -rotate-45' : 'mt-1'}`} />
        </button>
      </nav>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-navy-900/95 backdrop-blur-md px-6 pb-6 pt-2">
          <ul className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block py-3 px-2 text-sm text-white/70 transition-colors hover:text-white"
                  aria-current={pathname === link.href ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/reserve"
                onClick={() => setMobileOpen(false)}
                className="block py-3 px-2 text-sm text-white/70 transition-colors hover:text-white"
                aria-current={pathname === '/reserve' ? 'page' : undefined}
              >
                Reserve
              </Link>
            </li>
          </ul>
          <div className="mt-4 border-t border-white/10 pt-4">
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
                  onClick={() => { signOut({ callbackUrl: '/' }); setMobileOpen(false) }}
                  className="glass-btn glass-btn-ghost inline-flex items-center justify-center px-6 py-3 text-sm font-medium tracking-wide"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="block py-3 px-2 text-sm text-white/70 transition-colors hover:text-white"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
