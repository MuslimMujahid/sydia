export const DECISION_GATEWAY = Symbol('DECISION_GATEWAY');

export type DecisionQuestion =
  | {
      type: 'noul';
      instructions: string;
      criteria?: { true: string; false: string };
    }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> };
export type DecisionAnswer =
  | { type: 'noul'; noul: number }
  | {
      type: 'choice';
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    };
export type DecisionRequest = {
  stage: string;
  environment?: 'test' | 'development' | 'staging' | 'production';
  version: string;
  state: string;
  questions: Record<string, DecisionQuestion>;
  lane: 'interactive' | 'background';
  featureModes?: Record<string, 'off' | 'shadow' | 'reject-only' | 'enabled'>;
  abortSignal?: AbortSignal;
};
export type DecisionFailure =
  | 'disabled'
  | 'capacity'
  | 'budget'
  | 'privacy'
  | 'timeout'
  | 'cancelled'
  | 'invalid-response'
  | 'rate-limit'
  | 'provider';
export type DecisionResult =
  | {
      status: 'ok';
      model: string;
      answers: Record<string, DecisionAnswer>;
      inputTokens: number;
      outputTokens: number;
      costUsd: number | null;
      latencyMs: number;
    }
  | { status: 'fallback'; reason: DecisionFailure; latencyMs: number };
export interface DecisionGateway {
  decide(request: DecisionRequest): Promise<DecisionResult>;
}
