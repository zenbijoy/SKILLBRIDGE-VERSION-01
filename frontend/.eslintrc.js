module.exports = {
  extends: ["expo"],
  rules: {
    "react-hooks/set-state-in-effect": "off",
    "react-hooks/preserve-manual-memoization": "off",
    "react-hooks/purity": "off",
    "react-hooks/immutability": "off",
    "react-hooks/exhaustive-deps": "warn",
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/no-require-imports": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/array-type": "off",
  },
  settings: {
    "import/resolver": {
      typescript: {
        alwaysTryTypes: true,
        project: "./tsconfig.json",
      },
    },
  },
};

