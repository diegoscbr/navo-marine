import { Button } from '@/components/ui/Button'

export function ContactSection() {
  return (
    <section id="contact" className="py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-16 md:grid-cols-2 md:items-center">
          {/* Left: context */}
          <div>
            <h2 className="font-heading text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Work with NAVO.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-white/70">
              We work with competitive sailing teams and race organizers to deploy Atlas II instrumentation, build data infrastructure, and run race management programs.
            </p>

            <ul className="mt-8 space-y-4">
              {[
                { label: 'Who we work with', value: 'Offshore teams, regattas, sailing academies' },
                { label: 'What to expect', value: 'Response within one business day' },
                { label: 'Common inquiries', value: 'Atlas II orders, race management, partnerships' },
              ].map(({ label, value }) => (
                <li key={label} className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-widest text-white/40">{label}</span>
                  <span className="text-sm text-white/80">{value}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: CTA */}
          <div className="rounded-2xl border border-white/10 bg-navy-800/50 px-8 py-12 backdrop-blur-xl">
            <h3 className="font-heading text-xl font-semibold text-white">
              Send us a message
            </h3>
            <p className="mt-3 text-sm text-white/60">
              Tell us about your program and what you&apos;re looking to accomplish. We&apos;ll follow up with next steps.
            </p>
            <div className="mt-8">
              <Button variant="primary" href="mailto:info@navomarine.com?subject=Partnership%20Inquiry">
                Email NAVO
              </Button>
            </div>
            <p className="mt-6 text-xs text-white/30">
              info@navomarine.com
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
