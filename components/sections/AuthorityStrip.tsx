import Image from 'next/image'

const trustSignals = [
  {
    label: 'OFFICIAL BRAND PARTNER',
    name: 'Vakaros Atlas II',
    logoSrc: '/partners/2.png',
    logoWidth: 528,
    logoHeight: 100,
    logoClassName: 'h-40 w-auto -mt-0.1 object-contain',
    logoWrapperClassName: 'h-10 w-[100px]',
  },
  {
    label: 'PREMIER PARTNER',
    name: 'UR SAILING',
    logoSrc: '/partners/Cyclops-Marine-RGB.png',
    logoWidth: 140,
    logoHeight: 49,
    logoClassName: 'h-10 w-auto object-contain',
    logoWrapperClassName: 'h-10',
  },
  {
    label: 'POWERED BY',
    name: 'SailViewer',
    logoWrapperClassName: 'h-10',
  },
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
              <div
                className={`flex items-center justify-center ${signal.logoWrapperClassName ?? 'h-10'}`}
              >
                {signal.logoSrc ? (
                  <Image
                    src={signal.logoSrc}
                    alt={signal.name}
                    width={signal.logoWidth}
                    height={signal.logoHeight}
                    className={signal.logoClassName}
                  />
                ) : (
                  <span className="text-lg font-semibold text-white/80">{signal.name}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
