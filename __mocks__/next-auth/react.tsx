import React from 'react'

export const useSession = jest.fn(() => ({
  data: null,
  status: 'unauthenticated',
}))

export const signOut = jest.fn()

export const SessionProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>
