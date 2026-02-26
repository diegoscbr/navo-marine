import type { Metadata } from 'next'
import { ReserveForm } from './ReserveForm'

export const metadata: Metadata = {
  title: 'Reserve Vakaros Atlas II | NAVO Marine Technologies',
  description: 'Reserve your Vakaros Atlas II units through NAVO Marine Technologies.',
}

export default function ReservePage() {
  return <ReserveForm />
}
