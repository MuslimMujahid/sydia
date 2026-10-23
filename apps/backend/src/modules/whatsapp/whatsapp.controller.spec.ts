import { describe, expect, it, jest } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import type { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import type { AuthSecurityService } from '../../infra/auth';

describe('WhatsAppController QR setup', () => {
  it('returns the authenticated QR asset reference', async () => {
    const beginQr = jest.fn<WhatsAppService['beginQr']>().mockResolvedValue({
      attemptId: 'attempt-a',
      expiresAt: new Date('2026-10-22T06:10:00Z'),
      assetPath: '/whatsapp/companion/qr/attempt-a',
    });

    const controller = new WhatsAppController(
      { beginQr } as unknown as WhatsAppService,
      {
        limitWhatsAppSetup: () => Promise.resolve(),
      } as unknown as AuthSecurityService,
    );

    await expect(
      controller.qr({ user: { id: 'user-a' } } as never),
    ).resolves.toEqual({
      attemptId: 'attempt-a',
      expiresAt: new Date('2026-10-22T06:10:00Z'),
      assetPath: '/whatsapp/companion/qr/attempt-a',
    });
  });

  it('maps provider failures to an actionable service-unavailable response', async () => {
    const providerError = Object.assign(new Error('database is locked'), {
      code: 'ERR_STORE_LOCKED',
    });

    const beginQr = jest
      .fn<WhatsAppService['beginQr']>()
      .mockRejectedValue(providerError);

    const controller = new WhatsAppController(
      { beginQr } as unknown as WhatsAppService,
      {
        limitWhatsAppSetup: () => Promise.resolve(),
      } as unknown as AuthSecurityService,
    );

    await expect(
      controller.qr({ user: { id: 'user-a' } } as never),
    ).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          details: {},
        },
      },
    });
  });
});
