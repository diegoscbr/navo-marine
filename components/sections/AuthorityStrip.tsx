const trustSignals = [
  { label: 'Official Brand Partner', name: 'Vakaros Atlas II' },
  { label: 'Premier Partner', name: 'UR SAILING' },
  { label: 'Powered by', name: 'Advanced Marine Analytics' },
]

export function AuthorityStrip() {
  return (
    <section className="border-y border-white/10 bg-navy-800/50 py-8">
      <div className="mx-auto max-w-7xl px-6">
        <ul className="flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-16">
          {trustSignals.map((signal) => (
            <li key={signal.name} className="flex flex-col items-center gap-1 text-center">
              <span className="text-xs font-medium uppercase tracking-widest text-white/40">
                {signal.label}
              </span>
              <span className="text-sm font-semibold text-white/80">{signal.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
