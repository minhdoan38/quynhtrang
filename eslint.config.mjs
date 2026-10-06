import js from '@eslint/js';
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
    plugins: {
      '@next/next': {
        rules: {
          'no-img-element': { create: () => ({}) },
        },
      },
      'react-hooks': {
        rules: {
          'exhaustive-deps': { create: () => ({}) },
        },
      },
    },
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
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-empty': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      'prefer-const': 'off',
      'no-constant-condition': 'off',
      'no-useless-assignment': 'off',
      'no-extra-boolean-cast': 'off',
      'no-regex-spaces': 'off',
      'preserve-caught-error': 'off',
    },
  },
];
