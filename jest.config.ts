import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['/node_modules/', '/.claude/', '/everything-claude-code/', '/e2e/'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    'framer-motion': '<rootDir>/__mocks__/framer-motion.tsx',
    '^next-auth/react$': '<rootDir>/__mocks__/next-auth/react.tsx',
    '^react-day-picker$': '<rootDir>/__mocks__/react-day-picker.tsx',
  },
  collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    'app/api/**/*.ts',
    'lib/**/*.ts',
    '!**/*.d.ts',
    '!lib/generated/**',
    // Infrastructure / config — no business logic to unit-test
    '!lib/auth.ts',
    '!lib/auth.config.ts',
    '!lib/db/client.ts',
    '!lib/commerce/types.ts',
    '!app/api/auth/**',
    // Large auto-generated or data-only files
    '!lib/db/products.ts',
    '!lib/commerce/products.ts',
    // Complex UI-only (animations, admin form)
    '!components/admin/**',
    '!components/backgrounds/**',
    '!components/ui/ReserveCalendly*.tsx',
  ],
  coverageThreshold: {
    global: { lines: 80 },
  },
}

export default createJestConfig(config)
