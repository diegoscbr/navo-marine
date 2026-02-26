const CALENDLY_WIDGET_CSS = 'https://assets.calendly.com/assets/external/widget.css'
const CALENDLY_WIDGET_SCRIPT = 'https://assets.calendly.com/assets/external/widget.js'

export const CALENDLY_RESERVE_URL = 'https://calendly.com/d/cx99-3zw-gtb'
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']

declare global {
  interface Window {
    Calendly?: {
      initPopupWidget: (options: { url: string }) => void
    }
  }
}

let calendlyScriptPromise: Promise<boolean> | null = null

function ensureCalendlyStylesheet() {
  if (typeof document === 'undefined') return

  const existing = document.querySelector('link[data-calendly-widget-css="true"]')
  if (existing) return

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = CALENDLY_WIDGET_CSS
  link.dataset.calendlyWidgetCss = 'true'
  document.head.appendChild(link)
}

export function ensureCalendlyAssets(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false)
  }

  ensureCalendlyStylesheet()

  if (window.Calendly?.initPopupWidget) {
    return Promise.resolve(true)
  }

  if (calendlyScriptPromise) {
    return calendlyScriptPromise
  }

  calendlyScriptPromise = new Promise((resolve) => {
    const finalize = (loaded: boolean) => {
      if (!loaded) {
        calendlyScriptPromise = null
      }
      resolve(loaded)
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-calendly-widget-script="true"]'
    )

    if (existingScript) {
      existingScript.addEventListener('load', () => finalize(Boolean(window.Calendly)), { once: true })
      existingScript.addEventListener('error', () => finalize(false), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = CALENDLY_WIDGET_SCRIPT
    script.async = true
    script.dataset.calendlyWidgetScript = 'true'
    script.addEventListener('load', () => finalize(Boolean(window.Calendly)), { once: true })
    script.addEventListener('error', () => finalize(false), { once: true })
    document.head.appendChild(script)
  })

  return calendlyScriptPromise
}

export function withCalendlyTracking(url: string) {
  if (typeof window === 'undefined') return url

  const target = new URL(url)
  const sourceParams = new URLSearchParams(window.location.search)

  UTM_KEYS.forEach((key) => {
    const value = sourceParams.get(key)
    if (value) target.searchParams.set(key, value)
  })

  target.searchParams.set('page_path', window.location.pathname)
  return target.toString()
}

export async function openCalendlyPopupOrFallback(url = CALENDLY_RESERVE_URL) {
  if (typeof window === 'undefined') return

  const trackedUrl = withCalendlyTracking(url)
  const ready = await ensureCalendlyAssets()
  if (ready && window.Calendly?.initPopupWidget) {
    window.Calendly.initPopupWidget({ url: trackedUrl })
    return
  }

  window.open(trackedUrl, '_blank', 'noopener,noreferrer')
}
