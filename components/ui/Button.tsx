import Link from 'next/link'

type Variant = 'primary' | 'ghost'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: Variant
  href?: string
  children: React.ReactNode
}

const variantClass: Record<Variant, string> = {
  primary: 'glass-btn-primary',
  ghost: 'glass-btn-ghost',
}

const base =
  'glass-btn inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium tracking-wide disabled:opacity-50'

export function Button({ variant, href, children, className = '', ...props }: ButtonProps) {
  const classes = `${base} ${variantClass[variant]} ${className}`.trim()

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  )
}
