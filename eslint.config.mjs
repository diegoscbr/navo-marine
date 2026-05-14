import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Claude / agent tooling — not part of the Next.js app.
    ".agents/**",
    ".claude/**",
    ".superpowers/**",
    ".gstack/**",
    ".understand-anything/**",
    "everything-claude-code/**",
    // Generated coverage reports.
    "coverage/**",
  ]),
  // Allow CommonJS require() inside Jest test files and mocks — it's the
  // idiomatic pattern for jest.mock() and dynamic test setup.
  {
    files: ["__tests__/**", "__mocks__/**"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
