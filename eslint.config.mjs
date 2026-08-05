import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/cdk.out/**',
      'infra/frontend/**',
      'backend/src/evals/**',
      'backend/src/test-anthropic.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['backend/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },
);
