export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-white/10 bg-navy-900 py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-lg font-semibold tracking-widest text-white">
            NAVO Marine Technologies
          </p>
          <p className="text-sm text-white/40">
            Technology That Moves Sailing Forward.
          </p>
          <p className="text-xs text-white/30">
            © {year} NAVO Marine Technologies. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
