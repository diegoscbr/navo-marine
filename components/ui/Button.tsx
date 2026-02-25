import { forwardRef } from 'react'

type Variant = 'primary' | 'outline'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: Variant
  href?: string
  children: React.ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-marine-500 text-white hover:bg-marine-400 focus-visible:outline-marine-500',
  outline:
    'border border-marine-500 text-marine-400 hover:bg-marine-500 hover:text-white focus-visible:outline-marine-500',
}

const base =
  'inline-flex items-center justify-center rounded-md px-6 py-3 text-sm font-medium tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50'

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, href, children, className = '', ...props }, ref) => {
    const classes = `${base} ${variantClasses[variant]} ${className}`

    if (href) {
      return (
        <a href={href} className={classes}>
          {children}
        </a>
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
