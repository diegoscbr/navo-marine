/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react'

const searchParamsState: { value: URLSearchParams } = { value: new URLSearchParams() }

jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsState.value,
}))

import { useRehydrateSelection } from '@/lib/checkout/use-rehydrate-selection'
import type { Selection } from '@/lib/checkout/state-codec'

function Probe({ onApply }: { onApply: (s: Selection) => void }) {
  useRehydrateSelection(onApply)
  return null
}

beforeEach(() => {
  searchParamsState.value = new URLSearchParams()
})

describe('useRehydrateSelection', () => {
  it('calls apply with the decoded rental_event selection on mount', () => {
    searchParamsState.value = new URLSearchParams(
      'reservation_type=rental_event&product_id=p1&event_id=e1&sail_number=US-1',
    )
    const apply = jest.fn()
    render(<Probe onApply={apply} />)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith({
      reservation_type: 'rental_event',
      product_id: 'p1',
      event_id: 'e1',
      sail_number: 'US-1',
    })
  })

  it('does not call apply when the URL has no decodable selection', () => {
    searchParamsState.value = new URLSearchParams('foo=bar')
    const apply = jest.fn()
    render(<Probe onApply={apply} />)
    expect(apply).not.toHaveBeenCalled()
  })

  it('does not call apply when reservation_type is unknown', () => {
    searchParamsState.value = new URLSearchParams('reservation_type=membership&product_id=p1')
    const apply = jest.fn()
    render(<Probe onApply={apply} />)
    expect(apply).not.toHaveBeenCalled()
  })
})
