import React from 'react'

const motionProps = new Set([
  'initial', 'animate', 'exit', 'variants', 'transition',
  'whileHover', 'whileTap', 'whileFocus', 'whileInView',
  'viewport', 'layout', 'layoutId', 'onAnimationStart',
  'onAnimationComplete', 'drag', 'dragConstraints',
])

const motion = new Proxy({}, {
  get: (_target, prop: string) => {
    const Component = React.forwardRef(
      ({ children, ...props }: React.HTMLAttributes<HTMLElement>, ref: React.Ref<HTMLElement>) => {
        const domProps = Object.fromEntries(
          Object.entries(props).filter(([key]) => !motionProps.has(key))
        )
        return React.createElement(prop, { ...domProps, ref }, children)
      }
    )
    Component.displayName = prop
    return Component
  },
})

export { motion }
export const AnimatePresence = ({ children }: { children: React.ReactNode }) => <>{children}</>
export const useAnimation = () => ({ start: jest.fn() })
export const useInView = () => [null, true]
