import type { Metadata } from 'next'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { listActiveRentalEvents } from '@/lib/db/events'
import { CapabilitiesHero } from '@/components/sections/CapabilitiesHero'
import { StatsBand } from '@/components/sections/StatsBand'
import { ServiceColumns } from '@/components/sections/ServiceColumns'
import { UpcomingEventsPreview } from '@/components/sections/UpcomingEventsPreview'
import { PastEventsGrid } from '@/components/sections/PastEventsGrid'
import { PartnersBand } from '@/components/sections/PartnersBand'
import { Button } from '@/components/ui/Button'

export const metadata: Metadata = {
  title: 'Capabilities | NAVO Marine Technologies',
  description:
    'Premier Vakaros partner. Race-management technology and hardware access for the regattas that matter — youth to professional, across three continents.',
}

export default async function CapabilitiesPage() {
  const events = await listActiveRentalEvents()

  return (
    <>
      <Navbar />
      <main className="pt-24">
        <CapabilitiesHero />
        <StatsBand />
        <ServiceColumns />
        <UpcomingEventsPreview events={events} />
        <PastEventsGrid />
        <PartnersBand />
        <section className="bg-navy-800/40 py-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Race with us.
            </h2>
            <p className="mt-4 text-base text-white/70 sm:text-lg">
              Reserve your Atlas 2 for an upcoming event or pick custom dates.
            </p>
            <div className="mt-8 flex justify-center">
              <Button variant="primary" href="/reserve">
                Reserve Your Unit
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
