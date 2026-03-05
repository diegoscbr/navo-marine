import type { Metadata } from 'next'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { ContactSection } from '@/components/sections/ContactSection'
import { UnderwaterCaustics } from '@/components/backgrounds/UnderwaterCaustics'

export const metadata: Metadata = {
  title: 'Contact | NAVO Marine Technologies',
  description: 'Get in touch with NAVO Marine Technologies for partnership inquiries.',
}

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <main className="relative min-h-screen overflow-hidden pt-24">
        <UnderwaterCaustics className="absolute inset-0 z-0" />
        <div className="relative z-10">
          <ContactSection />
        </div>
      </main>
      <Footer />
    </>
  )
}
