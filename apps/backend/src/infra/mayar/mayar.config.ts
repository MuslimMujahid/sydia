export function validateBillingEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const enabled = (key: string): boolean => {
    const value = config[key];
    if (
      value === undefined ||
      value === '' ||
      value === 'false' ||
      value === false
    )
      return false;
    if (value === 'true' || value === true) return true;
    throw new Error(`${key} must be true or false`);
  };

  const checkout = enabled('BACKEND_BILLING_CHECKOUT_ENABLED');
  const enforcement = enabled('BACKEND_BILLING_ENFORCEMENT_ENABLED');
  const environment = config.MAYAR_ENVIRONMENT ?? 'sandbox';
  if (environment !== 'sandbox' && environment !== 'production')
    throw new Error('MAYAR_ENVIRONMENT must be sandbox or production');
  const rollout = config.BACKEND_BILLING_ROLLOUT_AT;

  if (
    (enforcement || checkout) &&
    (typeof rollout !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(rollout) ||
      !Number.isFinite(Date.parse(rollout)))
  ) {
    throw new Error(
      'Set BACKEND_BILLING_ROLLOUT_AT to a fixed UTC ISO timestamp before enabling billing',
    );
  }

  if (checkout && !enforcement)
    throw new Error('Enable billing enforcement before checkout');

  if (checkout) {
    for (const key of [
      'MAYAR_API_KEY',
      'MAYAR_WEBHOOK_TOKEN',
      'MAYAR_MERCHANT_ID',
      'MAYAR_MEMBERSHIP_PRODUCT_ID',
      'MAYAR_MEMBERSHIP_TIER_ID',
    ]) {
      if (typeof config[key] !== 'string' || !config[key].trim())
        throw new Error(`${key} is required for checkout`);
    }

    if (
      environment === 'production' &&
      (typeof config.BACKEND_AUTH_URL !== 'string' ||
        !config.BACKEND_AUTH_URL.startsWith('https://'))
    )
      throw new Error('Production billing requires an HTTPS BACKEND_AUTH_URL');
  }

  const price =
    config.BACKEND_BILLING_PRICE_IDR === undefined
      ? 29_000
      : Number(config.BACKEND_BILLING_PRICE_IDR);

  if (!Number.isSafeInteger(price) || price < 1 || price > 2_147_483_647)
    throw new Error(
      'BACKEND_BILLING_PRICE_IDR must be a positive integer rupiah amount',
    );

  return {
    BACKEND_BILLING_CHECKOUT_ENABLED: checkout,
    BACKEND_BILLING_ENFORCEMENT_ENABLED: enforcement,
    MAYAR_ENVIRONMENT: environment,
    BACKEND_BILLING_PRICE_IDR: price,
  };
}
