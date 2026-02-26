import { forwardRef } from 'react'
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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, href, children, className = '', ...props }, ref) => {
    const classes = `${base} ${variantClass[variant]} ${className}`

    if (href) {
      return (
        <Link href={href} className={classes}>
          {children}
        </Link>
      )
    }

    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
