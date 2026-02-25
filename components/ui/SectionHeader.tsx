interface SectionHeaderProps {
  heading: string
  subheading?: string
  centered?: boolean
}

export function SectionHeader({ heading, subheading, centered = true }: SectionHeaderProps) {
  return (
    <div className={`mb-16 ${centered ? 'text-center' : ''}`}>
      <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
        {heading}
      </h2>
      {subheading && (
        <p
          data-testid="subheading"
          className="mt-4 text-lg text-white/60"
        >
          {subheading}
        </p>
      )}
    </div>
  )
}
