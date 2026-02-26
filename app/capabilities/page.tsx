import type { Metadata } from 'next'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { CoreCapabilities } from '@/components/sections/CoreCapabilities'
import { DataCapabilities } from '@/components/sections/DataCapabilities'

export const metadata: Metadata = {
  title: 'Capabilities | NAVO Marine Technologies',
  description: 'Advanced race management, data infrastructure, and performance analytics for high-performance sailing.',
}

export default function CapabilitiesPage() {
  return (
    <>
      <Navbar />
      <main className="pt-24">
        <CoreCapabilities />
        <DataCapabilities />
      </main>
      <Footer />
    </>
  )
}
