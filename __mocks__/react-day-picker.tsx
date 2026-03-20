import React from 'react'

export function DayPicker({ onSelect: _onSelect, selected: _selected, disabled: _disabled, ...rest }: Record<string, unknown>) {
  return <div data-testid="day-picker" {...(rest as React.HTMLAttributes<HTMLDivElement>)} />
}

export type DateRange = { from?: Date; to?: Date }
