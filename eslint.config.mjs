"use strict";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    ignores: [
      "**/*.test.*",
      "**/*.spec.*",
      "**/__tests__/**",
      "**/coverage/**",
      "/dist/**",
      "**/test/**",
      "**/node_modules/**",
      "**/*.config.js",
      "**/*.config.ts",
      "*.js",
    ],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      semi: ["error", "always"],
    },
  },
  tseslint.configs.recommended,
]);
