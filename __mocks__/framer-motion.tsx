import React from 'react'

const motion = new Proxy({}, {
  get: (_target, prop: string) => {
    const Component = React.forwardRef(
      ({ children, ...props }: React.HTMLAttributes<HTMLElement>, ref: React.Ref<HTMLElement>) =>
        React.createElement(prop, { ...props, ref }, children)
    )
    Component.displayName = prop
    return Component
  },
})

export { motion }
export const AnimatePresence = ({ children }: { children: React.ReactNode }) => <>{children}</>
export const useAnimation = () => ({ start: jest.fn() })
export const useInView = () => [null, true]
