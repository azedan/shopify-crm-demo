/** @type {import('@types/eslint').Linter.BaseConfig} */
module.exports = {
  root: true,
  // No `jest-testing-library` preset: it pulls in eslint-plugin-jest, which
  // resolves the installed Jest version when a rule is constructed and throws
  // when there isn't one. This project tests with Vitest, so that preset aborts
  // the whole lint run the moment it reaches a *.test.ts file.
  extends: [
    "@remix-run/eslint-config",
    "@remix-run/eslint-config/node",
    "prettier",
  ],
  globals: {
    shopify: "readonly"
  },
};
