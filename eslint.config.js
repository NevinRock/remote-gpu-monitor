import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';

export default [
    {
        files: ['**/*.js'],
        ignores: ['dist/**'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {...globals.es2021, print: 'readonly', log: 'readonly', console: 'readonly',
                TextDecoder: 'readonly'},
        },
        plugins: {'@stylistic': stylistic},
        rules: {
            'curly': ['error', 'multi-or-nest', 'consistent'],
            'eqeqeq': 'error',
            'no-unused-vars': ['error', {argsIgnorePattern: '^_', caughtErrors: 'none'}],
            'prefer-const': 'error',
            '@stylistic/arrow-parens': ['error', 'as-needed'],
            '@stylistic/brace-style': ['error', '1tbs'],
            '@stylistic/comma-spacing': 'error',
            '@stylistic/indent': ['error', 4, {
                SwitchCase: 1,
                // GNOME convention: the class passed to GObject.registerClass() is not indented.
                ignoredNodes: ['CallExpression[callee.object.name=GObject][callee.property.name=registerClass] > ClassExpression:first-child'],
            }],
            '@stylistic/key-spacing': 'error',
            '@stylistic/keyword-spacing': 'error',
            '@stylistic/max-len': ['error', {code: 110, ignoreStrings: true, ignoreTemplateLiterals: true}],
            '@stylistic/max-statements-per-line': ['error', {max: 1}],
            '@stylistic/no-multi-spaces': 'error',
            '@stylistic/no-trailing-spaces': 'error',
            '@stylistic/object-curly-spacing': ['error', 'never'],
            '@stylistic/quotes': ['error', 'single', {avoidEscape: true}],
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/space-before-blocks': 'error',
            '@stylistic/space-infix-ops': 'error',
        },
    },
];
