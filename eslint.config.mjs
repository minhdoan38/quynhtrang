import js from '@eslint/js';
import globals from 'globals';
import babelParser from '@babel/eslint-parser';

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      '.superpowers/**',
      'test-*.ts',
      'test-*.js',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  {
    files: [
      'src/**/*.{js,mjs,cjs,ts,jsx,tsx}',
      'scripts/**/*.{js,mjs,cjs,ts}',
      'e2e/**/*.{js,mjs,cjs,ts}',
    ],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: [
            ['@babel/preset-typescript', { allowNamespaces: true }],
            ['@babel/preset-react', { runtime: 'automatic' }],
          ],
        },
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
      'no-unused-vars': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
      'no-extra-boolean-cast': 'off',
      'no-control-regex': 'off',
      'no-regex-spaces': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
    },
  },
];
