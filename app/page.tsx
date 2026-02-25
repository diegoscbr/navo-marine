import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { Hero } from '@/components/sections/Hero'
import { AuthorityStrip } from '@/components/sections/AuthorityStrip'
import { CoreCapabilities } from '@/components/sections/CoreCapabilities'
import { DataCapabilities } from '@/components/sections/DataCapabilities'
import { VakarosSection } from '@/components/sections/VakarosSection'
import { RaceManagement } from '@/components/sections/RaceManagement'
import { WhyNavo } from '@/components/sections/WhyNavo'
import { ClosingCTA } from '@/components/sections/ClosingCTA'
import { ContactSection } from '@/components/sections/ContactSection'

export default function Page() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <AuthorityStrip />
        <CoreCapabilities />
        <DataCapabilities />
        <VakarosSection />
        <RaceManagement />
        <WhyNavo />
        <ClosingCTA />
        <ContactSection />
      </main>
      <Footer />
    </>
  )
}
