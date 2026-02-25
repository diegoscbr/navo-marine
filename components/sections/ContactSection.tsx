export function ContactSection() {
  return (
    <section id="contact" className="py-24 bg-navy-800/40">
      <div className="mx-auto max-w-2xl px-6 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Get in Touch.
        </h2>
        <p className="mt-4 text-lg text-white/60">
          Ready to elevate your race program? Reach out to discuss partnership or consultation.
        </p>
        <div className="mt-10">
          <a
            href="mailto:info@navomarine.com?subject=Partnership%20Inquiry"
            className="inline-flex items-center justify-center rounded-md bg-marine-500 px-8 py-4 text-sm font-medium tracking-wide text-white transition-colors hover:bg-marine-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marine-500"
          >
            Contact NAVO
          </a>
        </div>
      </div>
    </section>
  )
}
