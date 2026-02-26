'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/Button'

const navLinks = [
  { label: 'Capabilities', href: '/capabilities' },
  { label: 'Contact', href: '/contact' },
  { label: 'Reserve', href: '/reserve' },
]

export function Navbar() {
  const pathname = usePathname()
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
                className="text-sm text-white/70 transition-colors hover:text-white"
                aria-current={pathname === link.href ? 'page' : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <Button variant="ghost" href="/login">
          Login
        </Button>
      </nav>
    </header>
  )
}
