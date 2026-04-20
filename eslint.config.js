const globals = require("globals");
const js = require("@eslint/js");

module.exports = [
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                ...globals.node,
                ...globals.jest,
            },
        },
        rules: {
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            "no-console": "off",
            "semi": ["error", "always"],
            "quotes": ["error", "double", { avoidEscape: true }],
            "eqeqeq": "error",
            "no-var": "error",
            "prefer-const": "warn",
        },
    },
    {
        ignores: ["node_modules/", "coverage/"],
    },
];
