import { describe, expect, it, jest } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import type { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';

describe('WhatsAppController companion pairing', () => {
  it('returns the provider pairing code', async () => {
    const pairCompanion = jest
      .fn<WhatsAppService['pairCompanion']>()
      .mockResolvedValue({ code: 'ABCD-EFGH' });

    const controller = new WhatsAppController({
      pairCompanion,
    } as unknown as WhatsAppService);

    await expect(
      controller.pairCompanion({ phone: '6285169319118' }),
    ).resolves.toEqual({ code: 'ABCD-EFGH' });
  });

  it('maps provider failures to an actionable service-unavailable response', async () => {
    const providerError = Object.assign(new Error('database is locked'), {
      code: 'ERR_STORE_LOCKED',
    });

    const pairCompanion = jest
      .fn<WhatsAppService['pairCompanion']>()
      .mockRejectedValue(providerError);

    const controller = new WhatsAppController({
      pairCompanion,
    } as unknown as WhatsAppService);

    await expect(
      controller.pairCompanion({ phone: '6285169319118' }),
    ).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          details: { providerCode: 'ERR_STORE_LOCKED' },
        },
      },
    });
  });
});
