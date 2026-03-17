import type { Metadata } from 'next'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { ReserveForm } from './ReserveForm'

export const metadata: Metadata = {
  title: 'Reserve Vakaros Atlas II | NAVO Marine Technologies',
  description: 'Book your Vakaros Atlas II reservation consultation through NAVO Marine Technologies.',
}

export default function ReservePage() {
  return (
    <>
      <Navbar />
      <ReserveForm />
      <Footer />
    </>
  )
}
