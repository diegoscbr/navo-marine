import { render } from '@testing-library/react'
import RootLayout from '@/app/layout'

describe('RootLayout', () => {
  it('renders children', () => {
    const { getByText } = render(
      <RootLayout>
        <p>test child</p>
      </RootLayout>
    )
    expect(getByText('test child')).toBeInTheDocument()
  })
})
