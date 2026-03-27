import type { Metadata } from 'next'
import localFont from 'next/font/local'
import AuthProvider from '@/components/providers/SessionProvider'
import './globals.css'

const sansation = localFont({
  src: [
    { path: '../public/fonts/sansation-latin-300-normal.woff2', weight: '300', style: 'normal' },
    { path: '../public/fonts/sansation-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/sansation-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-sansation',
  display: 'swap',
})

const raleway = localFont({
  src: [
    { path: '../public/fonts/raleway-latin-300-normal.woff2', weight: '300', style: 'normal' },
    { path: '../public/fonts/raleway-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/raleway-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/raleway-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/raleway-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-raleway',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'NAVO Marine Technologies | Precision Marine Performance',
  description:
    'Official Vakaros Atlas 2 Partner. Race management, performance analytics, and advanced marine data systems for high-performance sailing.',
  keywords: ['sailing', 'race management', 'marine analytics', 'Vakaros Atlas 2', 'performance sailing'],
  icons: {
    icon: '/logos/navo_icon_transparent.png',
    shortcut: '/logos/navo_icon_transparent.png',
    apple: '/logos/navo_icon_transparent.png',
  },
  openGraph: {
    title: 'NAVO Marine Technologies',
    description: 'Technology That Moves Sailing Forward.',
    type: 'website',
    url: 'https://navomarine.com',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sansation.variable} ${raleway.variable}`}>
      <body className="bg-navy-900 text-white antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
