import { defineConfig } from "vite-plus";

const ignorePatterns = [
  "node_modules/**",
  "dist/**",
  "**/dist/**",
  ".agents/**",
  "server/drizzle/**",
  "strava-webhook-proxy/drizzle/**",
  "package-lock.json",
  "**/*.db",
];

export default defineConfig({
  lint: {
    ignorePatterns,
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    plugins: ["typescript"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
    overrides: [
      {
        files: ["client/**"],
        plugins: ["typescript", "react"],
        rules: {
          "react-hooks/rules-of-hooks": "error",
          "react-hooks/exhaustive-deps": "warn",
        },
      },
      {
        files: ["server/**"],
        env: { node: true },
      },
      {
        files: ["strava-webhook-proxy/**"],
        env: { node: true },
      },
      {
        files: ["**/*.test.ts", "**/*.spec.ts"],
        plugins: ["typescript", "vitest"],
      },
    ],
  },
  fmt: {
    ignorePatterns,
    semi: true,
    singleQuote: false,
    endOfLine: "lf",
  },
  staged: {
    "*.{js,ts,tsx}": "vp check --fix",
    "!(package-lock).{json,md,yml,yaml}": "vp fmt --write",
  },
});
