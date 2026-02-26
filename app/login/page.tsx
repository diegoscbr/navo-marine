import Image from 'next/image'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy-900 px-6 text-center">
      <Image
        src="/logos/transparent_background_logo.png"
        alt="NAVO Marine Technologies"
        width={140}
        height={38}
        className="mb-12"
      />
      <h1 className="text-3xl font-semibold text-white">Login</h1>
      <p className="mt-4 text-white/40">Authentication coming soon.</p>
    </main>
  )
}
