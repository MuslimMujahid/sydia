export const SECRETARY_CLOCK = Symbol('SecretaryClock');

/** Injected so background timing can be tested without sleeping. */
export interface SecretaryClock {
  now(): Date;
}

export const systemSecretaryClock: SecretaryClock = { now: () => new Date() };
