import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "public/mockServiceWorker.js", "playwright-report", "test-results"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Component shadcn export cả variant; app/ và context export route/hook kèm component.
    files: ["src/shared/ui/**/*.tsx", "src/app/**/*.tsx", "src/**/*-context.tsx", "src/test/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    // Playwright fixture dùng tham số `use`, không phải React hook.
    files: ["e2e/**/*.ts", "playwright.config.ts", "scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
);
