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
    // Third-party bundles we did not write and must not edit — Bootstrap 5.1.3 and
    // friends, shipped minified (bootstrap.min.css is 164 KB on 7 lines). Linting them
    // produced 1404 of the project's 1600 findings and buried the 195 real ones. None of
    // these paths are tracked in git.
    "assets/**",
    "Narasimha Solutions Theme/**",
    // Throwaway agent worktrees: full copies of the repo, so every finding is a duplicate.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
