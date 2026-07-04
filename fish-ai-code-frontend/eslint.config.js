import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Our codebase uses the "fetch in useEffect, setState in .then" pattern
      // heavily for data loading. The new react-hooks/set-state-in-effect
      // rule is too strict for this — the pattern is correct here, just
      // not the React-19-idiomatic way. Demote to warning.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
