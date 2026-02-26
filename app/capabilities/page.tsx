import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { CoreCapabilities } from '@/components/sections/CoreCapabilities'
import { DataCapabilities } from '@/components/sections/DataCapabilities'

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
