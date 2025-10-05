module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:@typescript-eslint/stylistic-type-checked',
    'plugin:prettier/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules'],
  overrides: [
    {
      files: ['netlify/functions/**/*'],
      env: {
        browser: false,
        node: true,
      },
    },
  ],
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    'prettier/prettier': 'error',
  },
}
