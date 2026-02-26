'use client'

import { Button } from '@/components/ui/Button'
import { CALENDLY_RESERVE_URL, openCalendlyPopupOrFallback } from '@/lib/calendly'

interface ReserveCalendlyTriggerProps {
  label: string
  className?: string
  as?: 'button' | 'link'
  variant?: 'primary' | 'ghost'
  url?: string
}

export function ReserveCalendlyTrigger({
  label,
  className = '',
  as = 'button',
  variant = 'primary',
  url = CALENDLY_RESERVE_URL,
}: ReserveCalendlyTriggerProps) {
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault()
    void openCalendlyPopupOrFallback(url)
  }

  if (as === 'link') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={className}
      >
        {label}
      </a>
    )
  }

  return (
    <Button
      variant={variant}
      type="button"
      onClick={handleClick}
      className={className}
    >
      {label}
    </Button>
  )
}
