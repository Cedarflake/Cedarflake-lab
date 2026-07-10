module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  ignorePatterns: ['dist/', 'node_modules/'],
  overrides: [
    {
      files: ['src/**/*.ts', 'src/**/*.tsx'],
      parserOptions: {
        project: ['./tsconfig.emails.json']
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-non-null-assertion': 'warn'
      }
    },
    {
      files: ['scripts/**/*.ts', 'scripts/**/*.tsx'],
      parserOptions: {
        project: ['./tsconfig.scripts.json']
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/explicit-module-boundary-types': 'off'
      }
    }
  ]
};
