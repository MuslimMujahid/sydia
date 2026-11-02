import type { RecordAttributionInput, UserAttribution } from '../entities';

export interface IAttributionRepository {
  /**
   * Stores the first acquisition record for a user and never overwrites it.
   * Later visits must not claim credit for an existing signup.
   */
  recordFirstTouch(input: RecordAttributionInput): Promise<{
    attribution: UserAttribution;
    created: boolean;
  }>;
}

export const ATTRIBUTION_REPOSITORY = Symbol('IAttributionRepository');
