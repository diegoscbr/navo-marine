# Repository Guidelines

## Project Structure & Module Organization
`navo-marine` is a Next.js App Router project.
- `app/`: route entry points and page composition (`app/page.tsx`, `app/capabilities/page.tsx`, etc.).
- `components/`: reusable UI split by domain:
  - `components/sections/` for landing-page sections.
  - `components/layout/` for shared shell elements.
  - `components/ui/` for primitive controls.
- `__tests__/`: Jest tests mirroring app/component areas.
- `__mocks__/`: test doubles (for example `framer-motion`).
- `public/`: static assets (`public/video`, `public/logos`, `public/partners`).
- `docs/plans/`: implementation/design planning notes.

## Build, Test, and Development Commands
Use npm scripts from `package.json`:
- `npm run dev`: start local dev server at `http://localhost:3000`.
- `npm run build`: create production build.
- `npm run start`: run the production build locally.
- `npm run lint`: run ESLint (Next.js + TypeScript config).
- `npm test`: run unit/component tests with Jest.
- `npm test -- --coverage`: generate coverage and verify thresholds.
- `npm run test:e2e`: run Playwright E2E tests (add/update Playwright config before relying on this in CI).

## Coding Style & Naming Conventions
- Language: TypeScript (`strict` mode enabled).
- Imports: prefer `@/*` alias over deep relative paths.
- Formatting in current codebase: 2-space indentation, single quotes, no semicolons.
- React components: `PascalCase` file names and exports (example: `DataCapabilities.tsx`).
- Route files follow Next.js conventions (`page.tsx`, `layout.tsx`).
- Keep Tailwind utility usage readable; extract repeated UI into `components/ui`.

## Testing Guidelines
- Frameworks: Jest + Testing Library (`jest-environment-jsdom`).
- Test files use `*.test.ts`/`*.test.tsx` and mirror feature location under `__tests__/`.
- Mock browser/media behavior when needed (see `Hero.test.tsx` pattern).
- Coverage target: global line coverage >= 80% (configured in `jest.config.ts`).

## Commit & Pull Request Guidelines
- Recent history favors Conventional Commit prefixes: `feat:` and `fix:` with concise subjects.
- Use clear, scoped summaries when useful (example: `fix: DataCapabilities update stale href`).
- PRs should include:
  - what changed and why,
  - linked issue/task (if available),
  - test evidence (`npm run lint`, `npm test`),
  - screenshots/video for UI-impacting changes.
