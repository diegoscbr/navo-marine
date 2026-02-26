import { render, screen } from '@testing-library/react'
import Page from '@/app/page'

beforeAll(() => {
  jest.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  jest.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})
afterAll(() => { jest.restoreAllMocks() })

describe('Home page', () => {
  it('renders Hero headline', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { name: /technology that moves/i })).toBeInTheDocument()
  })

  it('renders VakarosSection heading', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { name: /official vakaros/i })).toBeInTheDocument()
  })

  it('does NOT render CoreCapabilities section', () => {
    render(<Page />)
    expect(screen.queryByRole('heading', { name: /built for high-performance/i })).not.toBeInTheDocument()
  })

  it('does NOT render RaceManagement section', () => {
    render(<Page />)
    expect(screen.queryByRole('heading', { name: /elite race execution/i })).not.toBeInTheDocument()
  })

  it('does NOT render contact section', () => {
    render(<Page />)
    expect(screen.queryByRole('heading', { name: /get in touch/i })).not.toBeInTheDocument()
  })
})
