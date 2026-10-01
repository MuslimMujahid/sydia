import { describe, expect, test } from '@jest/globals';
import { validateHindsightEnvironment } from './hindsight.config';

const enabled = {
  BACKEND_MEMORY_ENGINE: 'hindsight',
  BACKEND_HINDSIGHT_URL: 'http://127.0.0.1:8888/',
  BACKEND_HINDSIGHT_API_KEY: 'test-key',
  BACKEND_HINDSIGHT_NAMESPACE: 'sydia-test',
};

describe('Hindsight environment validation', () => {
  test('keeps ingestion and automatic recall off by default', () => {
    expect(validateHindsightEnvironment({})).toMatchObject({
      BACKEND_MEMORY_ENGINE: 'legacy',
      BACKEND_HINDSIGHT_INGESTION_ENABLED: false,
      BACKEND_MEMORY_AUTO_RECALL_ENABLED: false,
      BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY: undefined,
    });
  });

  test('normalizes typed settings for API and worker', () => {
    expect(
      validateHindsightEnvironment({
        ...enabled,
        BACKEND_HINDSIGHT_CONCURRENCY: '2',
        BACKEND_HINDSIGHT_INGESTION_ENABLED: 'true',
        BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY: '0.2',
      }),
    ).toMatchObject({
      BACKEND_HINDSIGHT_URL: 'http://127.0.0.1:8888',
      BACKEND_HINDSIGHT_CONCURRENCY: 2,
      BACKEND_HINDSIGHT_INGESTION_ENABLED: true,
      BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY: 0.2,
    });
  });

  test.each([
    'BACKEND_HINDSIGHT_URL',
    'BACKEND_HINDSIGHT_API_KEY',
    'BACKEND_HINDSIGHT_NAMESPACE',
  ])('requires %s outside legacy mode', (key) => {
    expect(() =>
      validateHindsightEnvironment({ ...enabled, [key]: '' }),
    ).toThrow(/require/);
  });

  test.each([
    'ftp://localhost',
    'http://user:password@localhost',
    'http://localhost/path',
    'http://localhost?token=secret',
    'http://localhost#fragment',
  ])('rejects unsafe endpoint %s', (url) => {
    expect(() =>
      validateHindsightEnvironment({ ...enabled, BACKEND_HINDSIGHT_URL: url }),
    ).toThrow(/URL/);
  });

  test.each([
    { BACKEND_MEMORY_ENGINE: 'fallback' },
    { BACKEND_HINDSIGHT_NAMESPACE: '../other' },
    { BACKEND_HINDSIGHT_RETIRED_NAMESPACES: 'older,../other' },
    { BACKEND_HINDSIGHT_CONCURRENCY: '0' },
    { BACKEND_HINDSIGHT_RECALL_TOKENS: 'Infinity' },
    { BACKEND_MEMORY_AUTO_RECALL_ENABLED: 'yes' },
    { BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY: 'NaN' },
    { BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY: '-0.1' },
    { BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY: '1.1' },
    { BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY: true },
  ])('rejects malformed setting %j', (overrides) => {
    expect(() =>
      validateHindsightEnvironment({ ...enabled, ...overrides }),
    ).toThrow();
  });
});
