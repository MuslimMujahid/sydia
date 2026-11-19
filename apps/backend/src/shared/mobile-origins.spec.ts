import { describe, expect, it } from '@jest/globals';
import { getMobileOrigins } from './mobile-origins';

describe('getMobileOrigins', () => {
  it('trusts only the app scheme outside development', () => {
    expect(getMobileOrigins('production')).toEqual(['sydia://', 'sydia://*']);
    expect(getMobileOrigins(undefined)).toEqual(['sydia://', 'sydia://*']);
  });

  it('also trusts Expo development origins in development', () => {
    expect(getMobileOrigins('development')).toEqual([
      'sydia://',
      'sydia://*',
      'exp://',
      'exp://**',
    ]);
  });
});
