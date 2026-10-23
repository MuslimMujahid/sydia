export function resolveWhatsAppWebhookSecret(
  config: Record<string, unknown>,
): string {
  const value = config.BACKEND_WHATSAPP_WEBHOOK_SECRET;
  if (typeof value === 'string' && value.trim()) return value.trim();

  if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test')
    return 'dev-secret';

  throw new Error(
    'BACKEND_WHATSAPP_WEBHOOK_SECRET is required outside development and test',
  );
}
