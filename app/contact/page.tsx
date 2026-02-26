import type { Metadata } from 'next'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { ContactSection } from '@/components/sections/ContactSection'

export const metadata: Metadata = {
  title: 'Contact | NAVO Marine Technologies',
  description: 'Get in touch with NAVO Marine Technologies for partnership inquiries.',
}

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <main className="pt-24">
        <ContactSection />
      </main>
      <Footer />
    </>
  )
}
