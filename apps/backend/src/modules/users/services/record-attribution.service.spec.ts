import { describe, expect, jest, test } from '@jest/globals';
import type { UserAttribution } from '../../../database/entities';
import type {
  IAttributionRepository,
  IAuditEventRepository,
} from '../../../database/interfaces';
import type { RecordAttributionDto } from '../dto';
import { RecordAttributionService } from './record-attribution.service';

const firstTouch: UserAttribution = {
  userId: 'user-1',
  visitorId: '4f4b6f0e-6a1e-4a0b-9c1e-6d9a1e2b3c4d',
  utmSource: 'google',
  utmMedium: 'cpc',
  utmCampaign: 'launch',
  utmContent: null,
  utmTerm: null,
  referrer: 'https://google.com/',
  landingPath: '/harga',
  createdAt: new Date('2026-11-02T00:00:00Z'),
};

function createService(existing: UserAttribution | null = null) {
  const recordFirstTouch = jest
    .fn<IAttributionRepository['recordFirstTouch']>()
    .mockImplementation((input) =>
      Promise.resolve({
        attribution: existing ?? { ...firstTouch, ...input },
        created: existing === null,
      }),
    );

  const record = jest
    .fn<IAuditEventRepository['record']>()
    .mockResolvedValue(undefined);

  const repository: IAttributionRepository = { recordFirstTouch };
  const audit: IAuditEventRepository = { record };
  const service = new RecordAttributionService(repository, audit);

  return { service, recordFirstTouch, record };
}

const submission: RecordAttributionDto = {
  visitorId: firstTouch.visitorId ?? undefined,
  utmSource: 'google',
  utmMedium: 'cpc',
  utmCampaign: 'launch',
  referrer: 'https://google.com/',
  landingPath: '/harga',
};

describe('RecordAttributionService', () => {
  test('stores the first touch and audits it once', async () => {
    const { service, recordFirstTouch, record } = createService();

    const result = await service.execute('user-1', submission);

    expect(result.recorded).toBe(true);
    expect(result.attribution?.utmSource).toBe('google');
    expect(recordFirstTouch).toHaveBeenCalledWith({
      userId: 'user-1',
      visitorId: firstTouch.visitorId,
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'launch',
      utmContent: null,
      utmTerm: null,
      referrer: 'https://google.com/',
      landingPath: '/harga',
    });
    expect(record).toHaveBeenCalledTimes(1);
  });

  test('keeps the stored first touch when a later visit submits again', async () => {
    const { service, record } = createService(firstTouch);

    const result = await service.execute('user-1', {
      visitorId: 'another-visitor-id',
      utmSource: 'newsletter',
    });

    expect(result.recorded).toBe(true);
    expect(result.attribution?.utmSource).toBe('google');
    expect(result.attribution?.visitorId).toBe(firstTouch.visitorId);
    // A repeat submission must not claim a second acquisition event.
    expect(record).not.toHaveBeenCalled();
  });

  test('records nothing when the handoff carries no signal', async () => {
    const { service, recordFirstTouch, record } = createService();

    const result = await service.execute('user-1', {});

    expect(result).toEqual({ recorded: false, attribution: null });
    expect(recordFirstTouch).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});
