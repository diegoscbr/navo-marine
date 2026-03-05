import { Button } from '@/components/ui/Button'

export function ContactSection() {
  return (
    <section id="contact" className="py-24">
      <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-navy-800/50 px-6 py-16 text-center backdrop-blur-xl">
        <h2 className="font-heading text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Get in Touch.
        </h2>
        <p className="mt-4 text-lg text-white/60">
          Ready to elevate your race program? Reach out to discuss partnership or consultation.
        </p>
        <div className="mt-10">
          <Button variant="primary" href="mailto:info@navomarine.com?subject=Partnership%20Inquiry">
            Contact NAVO
          </Button>
        </div>
      </div>
    </section>
  )
}
