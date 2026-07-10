import js from "@eslint/js";
import globals from "globals";
import eslintReact from "@eslint-react/eslint-plugin";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

const reactRefreshRecommendedRules =
  reactRefresh.configs?.flat?.recommended?.rules ?? reactRefresh.configs?.recommended?.rules ?? {};

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "snapshot/**",
      "assets/static/**",
      "assets/**/fonts/**",
      "assets/**/images/**",
      "**/*.min.*",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    ...eslintReact.configs.recommended,
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ...eslintReact.configs["recommended-typescript"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{tsx,jsx}"],
    plugins: { "react-refresh": reactRefresh },
    rules: {
      ...reactRefreshRecommendedRules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@eslint-react/no-create-ref": "warn",
    },
  },
  {
    files: ["scripts/**/*.{js,mjs,cjs}"],
    rules: {
      "no-fallthrough": "off",
    },
  },
  {
    files: ["vite.config.ts", "scripts/**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
    },
  },
  prettier,
];
