import { resolveWhatsAppWebhookSecret } from './whatsapp.config';

describe('WhatsApp webhook configuration', () => {
  test('production rejects a missing webhook secret at startup', () => {
    expect(() =>
      resolveWhatsAppWebhookSecret({ NODE_ENV: 'production' }),
    ).toThrow('BACKEND_WHATSAPP_WEBHOOK_SECRET');
  });

  test('production rejects a whitespace-only webhook secret', () => {
    expect(() =>
      resolveWhatsAppWebhookSecret({
        NODE_ENV: 'production',
        BACKEND_WHATSAPP_WEBHOOK_SECRET: '   ',
      }),
    ).toThrow('BACKEND_WHATSAPP_WEBHOOK_SECRET');
  });

  test('an unspecified environment cannot enable the development fallback', () => {
    expect(() => resolveWhatsAppWebhookSecret({})).toThrow(
      'BACKEND_WHATSAPP_WEBHOOK_SECRET',
    );
  });

  test('a configured production secret is preserved without surrounding whitespace', () => {
    expect(
      resolveWhatsAppWebhookSecret({
        NODE_ENV: 'production',
        BACKEND_WHATSAPP_WEBHOOK_SECRET: ' deployment-secret ',
      }),
    ).toBe('deployment-secret');
  });

  test('development retains the existing local secret', () => {
    expect(resolveWhatsAppWebhookSecret({ NODE_ENV: 'development' })).toBe(
      'dev-secret',
    );
  });

  test('tests retain the existing local secret', () => {
    expect(resolveWhatsAppWebhookSecret({ NODE_ENV: 'test' })).toBe(
      'dev-secret',
    );
  });
});
