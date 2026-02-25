'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'

const navLinks = [
  { label: 'Capabilities', href: '#capabilities' },
  { label: 'Race Management', href: '#race-management' },
  { label: 'Data Systems', href: '#data' },
  { label: 'Vakaros Atlas II', href: '#vakaros' },
  { label: 'Contact', href: '#contact' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)

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
        <a href="#" className="text-xl font-bold tracking-widest text-white">
          NAVO
        </a>

        <ul className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm text-white/70 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <Button variant="primary" href="#contact">
          Partner With NAVO
        </Button>
      </nav>
    </header>
  )
}
