import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const DECISION_MODEL = 'typesafe/jev-1.13';
export const OPENROUTER_DECISION_SNAPSHOT = 'typesafe/jev-1.13-20260917';
export const DECISION_FEATURES = {
  eligibility: 'BACKEND_MEMORY_ELIGIBILITY_MODE',
  facts: 'BACKEND_MEMORY_FACT_REVIEW_MODE',
  recall: 'BACKEND_MEMORY_RECALL_DECISION_MODE',
  tools: 'BACKEND_TOOL_GROUP_SELECTION_MODE',
} as const;
export type DecisionFeature = keyof typeof DECISION_FEATURES;
export type DecisionMode = 'off' | 'shadow' | 'reject-only' | 'enabled';
/**
 * Memory cutoffs come from the owner-approved calibration of 2026-11-07
 * (test/optimization/memory-calibration.live.spec.ts): on its examples,
 * eligibilitySkip=0.5 missed no memory and reviewed no non-memory, and
 * fact evidence >= 0.5 with durability >= 0.75 lost no memory. Durability
 * 0.8 was too tight: ordinary facts score 0.79-0.83, and one rejected fact
 * rejects every fact from its message.
 */
export const DEFAULT_DECISION_THRESHOLDS = {
  eligibilitySkip: 0.5,
  recallInclude: 0.6,
  toolInclude: 0.6,
  /** Grounding, per-span support and evidence coverage of a candidate fact. */
  factEvidence: 0.5,
  /** Whether a candidate fact is worth remembering. */
  factDurable: 0.75,
} as const;
/**
 * Thresholds that no longer apply but may still be set in deployed
 * environments; they are accepted and ignored so those environments start.
 * sensitiveNo gated sensitive memories, which are now treated like any other.
 * factAllow applied one cutoff to every fact check; at 0.85 it rejected two
 * thirds of real memories, and factEvidence/factDurable replace it.
 */
const RETIRED_DECISION_THRESHOLDS = new Set(['sensitiveNo', 'factAllow']);
export type DecisionThresholds = {
  -readonly [K in keyof typeof DEFAULT_DECISION_THRESHOLDS]: number;
};

function text(
  config: Record<string, unknown>,
  key: string,
  fallback = '',
): string {
  const value = config[key];
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string') throw new Error(`${key} must be a string`);

  return value.trim();
}

function integer(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
  max: number,
): number {
  const value = config[key];
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max)
    throw new Error(`${key} must be an integer between 1 and ${max}`);

  return parsed;
}

export function validateDecisionEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const provider = text(config, 'BACKEND_DECISION_PROVIDER', 'openrouter');
  if (provider !== 'openrouter' && provider !== 'typesafe')
    throw new Error('BACKEND_DECISION_PROVIDER must be openrouter or typesafe');
  const expectedModel =
    provider === 'openrouter' ? DECISION_MODEL : 'jev-1.13.0';

  const model = text(config, 'BACKEND_DECISION_MODEL', expectedModel);
  if (model !== expectedModel)
    throw new Error(
      `BACKEND_DECISION_MODEL must be ${expectedModel}; recalibrate before changing the pinned model`,
    );
  const settings: Record<string, unknown> = {
    BACKEND_DECISION_PROVIDER: provider,
    BACKEND_DECISION_API_KEY: text(config, 'BACKEND_DECISION_API_KEY'),
    BACKEND_DECISION_MODEL: model,
    BACKEND_DECISION_COHORT: text(config, 'BACKEND_DECISION_COHORT'),
    BACKEND_DECISION_CALIBRATION_VERSION: text(
      config,
      'BACKEND_DECISION_CALIBRATION_VERSION',
    ),
    BACKEND_DECISION_TIMEOUT_MS: integer(
      config,
      'BACKEND_DECISION_TIMEOUT_MS',
      600,
      5000,
    ),
    BACKEND_DECISION_BACKGROUND_TIMEOUT_MS: integer(
      config,
      'BACKEND_DECISION_BACKGROUND_TIMEOUT_MS',
      5000,
      15000,
    ),
    BACKEND_DECISION_INTERACTIVE_CONCURRENCY: integer(
      config,
      'BACKEND_DECISION_INTERACTIVE_CONCURRENCY',
      6,
      16,
    ),
    BACKEND_DECISION_BACKGROUND_CONCURRENCY: integer(
      config,
      'BACKEND_DECISION_BACKGROUND_CONCURRENCY',
      2,
      8,
    ),
    BACKEND_DECISION_SHADOW_SAMPLE_PERCENT: integer(
      config,
      'BACKEND_DECISION_SHADOW_SAMPLE_PERCENT',
      5,
      100,
    ),
  };

  for (const [feature, key] of Object.entries(DECISION_FEATURES)) {
    const mode = text(config, key, 'off');
    if (
      ![
        'off',
        'shadow',
        'enabled',
        ...(feature === 'facts' ? ['reject-only'] : []),
      ].includes(mode)
    )
      throw new Error(`${key} has an invalid decision mode`);
    if (
      (mode === 'enabled' || mode === 'reject-only') &&
      !settings.BACKEND_DECISION_CALIBRATION_VERSION
    )
      throw new Error(
        `${key} requires BACKEND_DECISION_CALIBRATION_VERSION from a reviewed evaluation`,
      );
    settings[key] = mode;
  }

  let thresholds: unknown;

  try {
    thresholds = JSON.parse(
      text(config, 'BACKEND_DECISION_THRESHOLDS_JSON', '{}'),
    ) as unknown;
  } catch {
    throw new Error('BACKEND_DECISION_THRESHOLDS_JSON must be a JSON object');
  }

  if (
    !thresholds ||
    typeof thresholds !== 'object' ||
    Array.isArray(thresholds)
  )
    throw new Error('BACKEND_DECISION_THRESHOLDS_JSON must be a JSON object');
  const supplied = thresholds as Record<string, unknown>;
  if (
    Object.keys(supplied).some(
      (key) =>
        !Object.hasOwn(DEFAULT_DECISION_THRESHOLDS, key) &&
        !RETIRED_DECISION_THRESHOLDS.has(key),
    )
  )
    throw new Error(
      'BACKEND_DECISION_THRESHOLDS_JSON contains an unknown threshold',
    );
  const parsed = { ...DEFAULT_DECISION_THRESHOLDS } as DecisionThresholds;

  for (const key of Object.keys(parsed) as Array<keyof DecisionThresholds>) {
    const value = supplied[key] ?? parsed[key];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value >= 1
    )
      throw new Error(
        `Decision threshold ${key} must be between 0 and 1 exclusively`,
      );
    parsed[key] = value;
  }

  settings.BACKEND_DECISION_THRESHOLDS_JSON = JSON.stringify(parsed);

  return settings;
}

@Injectable()
export class DecisionSettings {
  readonly model: string;
  readonly thresholds: DecisionThresholds;
  readonly version: string;
  readonly shadowSamplePercent: number;
  private readonly cohort: Set<string>;
  private readonly modes: Record<DecisionFeature, DecisionMode>;
  constructor(config: ConfigService) {
    const keys = [
      ...Object.values(DECISION_FEATURES),
      'BACKEND_DECISION_MODEL',
      'BACKEND_DECISION_PROVIDER',
      'BACKEND_DECISION_API_KEY',
      'BACKEND_DECISION_COHORT',
      'BACKEND_DECISION_CALIBRATION_VERSION',
      'BACKEND_DECISION_THRESHOLDS_JSON',
      'BACKEND_DECISION_SHADOW_SAMPLE_PERCENT',
    ];

    const validated = validateDecisionEnvironment(
      Object.fromEntries(keys.map((key) => [key, config.get<unknown>(key)])),
    );

    this.model = validated.BACKEND_DECISION_MODEL as string;
    this.version =
      (validated.BACKEND_DECISION_CALIBRATION_VERSION as string) ||
      'provisional-v1';
    this.thresholds = JSON.parse(
      validated.BACKEND_DECISION_THRESHOLDS_JSON as string,
    ) as DecisionThresholds;
    this.shadowSamplePercent =
      validated.BACKEND_DECISION_SHADOW_SAMPLE_PERCENT as number;
    this.cohort = new Set(
      (validated.BACKEND_DECISION_COHORT as string)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
    this.modes = Object.fromEntries(
      Object.entries(DECISION_FEATURES).map(([feature, key]) => [
        feature,
        validated[key],
      ]),
    ) as Record<DecisionFeature, DecisionMode>;
  }

  mode(feature: DecisionFeature, userId: string): DecisionMode {
    const mode = this.modes[feature];
    if (mode === 'enabled' || mode === 'reject-only')
      return this.cohort.has('*') || this.cohort.has(userId) ? mode : 'off';

    return mode;
  }
}
