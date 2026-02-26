'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/Button'

export function ReserveForm() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
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

      <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
        Reserve Vakaros Atlas II Units
      </h1>

      <p className="mt-4 text-lg text-white/50">
        Reservation system launching soon.
      </p>

      {submitted ? (
        <p className="mt-10 text-marine-400">
          You're on the list. We'll be in touch.
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mt-10 flex w-full max-w-sm flex-col gap-3 sm:flex-row"
        >
          <label htmlFor="notify-email" className="sr-only">Email</label>
          <input
            id="notify-email"
            type="email"
            required
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm text-white placeholder:text-white/30 backdrop-blur focus:outline-none focus:ring-2 focus:ring-marine-500"
          />
          <Button variant="primary" type="submit">
            Notify Me
          </Button>
        </form>
      )}
    </main>
  )
}
