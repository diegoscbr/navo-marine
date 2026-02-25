import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'NAVO Marine Technologies | Precision Marine Performance',
  description:
    'Official Vakaros Atlas II Partner. Race management, performance analytics, and advanced marine data systems for high-performance sailing.',
  keywords: ['sailing', 'race management', 'marine analytics', 'Vakaros Atlas II', 'performance sailing'],
  openGraph: {
    title: 'NAVO Marine Technologies',
    description: 'Technology That Moves Sailing Forward.',
    type: 'website',
    url: 'https://navomarine.com',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-navy-900 text-white antialiased">{children}</body>
    </html>
  )
}
