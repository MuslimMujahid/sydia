import { createDefaultEsmPreset } from 'ts-jest';

const preset = createDefaultEsmPreset({
  tsconfig: './tsconfig.jest.json',
});

export default {
  ...preset,
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(@nestjs|better-auth|better-call|better-fetch|@noble|@standard-schema|defu|jose|kysely|nanostores|rou3|set-cookie-parser|zod)/)',
  ],
  testEnvironment: 'node',
};
