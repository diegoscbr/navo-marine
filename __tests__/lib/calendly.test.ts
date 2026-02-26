import { CALENDLY_RESERVE_URL, openCalendlyPopupOrFallback, withCalendlyTracking } from '@/lib/calendly'

describe('calendly helpers', () => {
  const originalWindowOpen = window.open
  const originalCalendly = window.Calendly

  beforeEach(() => {
    document.head.innerHTML = ''
    window.Calendly = undefined
  })

  afterEach(() => {
    window.open = originalWindowOpen
    window.Calendly = originalCalendly
    jest.restoreAllMocks()
  })

  it('opens popup widget when Calendly is available', async () => {
    const initPopupWidget = jest.fn()
    window.Calendly = { initPopupWidget }
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)

    await openCalendlyPopupOrFallback()

    expect(initPopupWidget).toHaveBeenCalledWith({ url: withCalendlyTracking(CALENDLY_RESERVE_URL) })
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('falls back to opening new tab when script cannot load', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)

    const popupAttempt = openCalendlyPopupOrFallback()
    const script = document.querySelector('script[data-calendly-widget-script="true"]')
    expect(script).toBeInTheDocument()

    script?.dispatchEvent(new Event('error'))
    await popupAttempt

    expect(openSpy).toHaveBeenCalledWith(
      withCalendlyTracking(CALENDLY_RESERVE_URL),
      '_blank',
      'noopener,noreferrer'
    )
  })
})
