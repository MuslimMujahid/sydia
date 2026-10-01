import { ConfigService } from '@nestjs/config';
import {
  DecisionSettings,
  validateDecisionEnvironment,
} from './decision.config';

describe('decision configuration', () => {
  test('defaults off and pins the evaluated model', () => {
    const parsed = validateDecisionEnvironment({});
    expect(parsed.BACKEND_DECISION_MODEL).toBe('typesafe/jev-1.13');
    expect(parsed.BACKEND_MEMORY_FACT_REVIEW_MODE).toBe('off');
    expect(
      JSON.parse(parsed.BACKEND_DECISION_THRESHOLDS_JSON as string),
    ).toMatchObject({
      recallInclude: 0.6,
      toolInclude: 0.6,
      factAllow: 0.85,
    });
    expect(
      new DecisionSettings(new ConfigService()).mode('tools', 'user'),
    ).toBe('off');
  });
  test('enabled modes require a reviewed calibration and an explicit user cohort', () => {
    expect(() =>
      validateDecisionEnvironment({
        BACKEND_TOOL_GROUP_SELECTION_MODE: 'enabled',
      }),
    ).toThrow('CALIBRATION_VERSION');
    const settings = new DecisionSettings(
      new ConfigService({
        BACKEND_TOOL_GROUP_SELECTION_MODE: 'enabled',
        BACKEND_DECISION_CALIBRATION_VERSION: 'reviewed-v1',
        BACKEND_DECISION_COHORT: 'alice',
      }),
    );

    expect(settings.mode('tools', 'alice')).toBe('enabled');
    expect(settings.mode('tools', 'bob')).toBe('off');
    expect(
      new DecisionSettings(
        new ConfigService({
          BACKEND_TOOL_GROUP_SELECTION_MODE: 'enabled',
          BACKEND_DECISION_CALIBRATION_VERSION: 'reviewed-v1',
        }),
      ).mode('tools', 'alice'),
    ).toBe('off');
  });
  test('explicit wildcard cutover includes existing and future users', () => {
    const settings = new DecisionSettings(
      new ConfigService({
        BACKEND_TOOL_GROUP_SELECTION_MODE: 'enabled',
        BACKEND_MEMORY_FACT_REVIEW_MODE: 'enabled',
        BACKEND_DECISION_CALIBRATION_VERSION: 'accepted-cutover-v1',
        BACKEND_DECISION_COHORT: '*',
      }),
    );

    expect(settings.mode('tools', 'existing-user')).toBe('enabled');
    expect(settings.mode('tools', 'new-user')).toBe('enabled');
    expect(settings.mode('facts', 'new-user')).toBe('enabled');
    expect(settings.mode('recall', 'new-user')).toBe('off');
  });
  test.each([
    { BACKEND_DECISION_MODEL: 'jev-latest' },
    { BACKEND_MEMORY_RECALL_DECISION_MODE: 'reject-only' },
    { BACKEND_DECISION_TIMEOUT_MS: '0' },
    { BACKEND_DECISION_THRESHOLDS_JSON: '{' },
    { BACKEND_DECISION_THRESHOLDS_JSON: '{"factAllow":-1}' },
    { BACKEND_DECISION_THRESHOLDS_JSON: '{"unknown":0.5}' },
    { BACKEND_DECISION_THRESHOLDS_JSON: '{"recallSkip":0.01}' },
    { BACKEND_DECISION_THRESHOLDS_JSON: '{"toolExclude":0.01}' },
    { BACKEND_DECISION_THRESHOLDS_JSON: '{"constructor":0.5}' },
    { BACKEND_DECISION_THRESHOLDS_JSON: '{"__proto__":0.5}' },
    {
      BACKEND_DECISION_THRESHOLDS_JSON: '{"factReject":0.9,"factAllow":0.8}',
    },
  ])('rejects invalid controls %j', (config) => {
    expect(() => validateDecisionEnvironment(config)).toThrow();
  });
});
