export default {
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    'import/resolver': {
        typescript: {}
    },
    extends: [
        'eslint:recommended',
        '@typescript-eslint/recommended'
    ],
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
    }
};
