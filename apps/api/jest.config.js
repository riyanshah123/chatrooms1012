/** Unit tests: *.spec.ts next to the code they test. E2E lives in test/. */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@chatrooms/contracts$": "<rootDir>/../../../packages/contracts/src",
  },
  collectCoverageFrom: ["**/*.ts", "!**/*.module.ts", "!main.ts"],
  clearMocks: true,
};
