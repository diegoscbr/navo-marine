import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['/node_modules/', '/.claude/', '/everything-claude-code/'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    'framer-motion': '<rootDir>/__mocks__/framer-motion.tsx',
    '^next-auth/react$': '<rootDir>/__mocks__/next-auth/react.tsx',
  },
  collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    'app/api/**/*.ts',
    'lib/**/*.ts',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: { lines: 80 },
  },
}

export default createJestConfig(config)
