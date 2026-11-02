import { Inject, Injectable } from '@nestjs/common';
import {
  ATTRIBUTION_REPOSITORY,
  AUDIT_EVENT_REPOSITORY,
  type IAttributionRepository,
  type IAuditEventRepository,
} from '../../../database/interfaces';
import type { UserAttribution } from '../../../database/entities';
import type { RecordAttributionDto } from '../dto';

const ATTRIBUTION_RECORDED_EVENT = 'user.attribution.recorded';

const SIGNAL_FIELDS = [
  'visitorId',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
  'utmTerm',
  'referrer',
  'landingPath',
] as const;

export type RecordAttributionResult =
  | { recorded: false; attribution: null }
  | { recorded: true; attribution: UserAttribution };

@Injectable()
export class RecordAttributionService {
  constructor(
    @Inject(ATTRIBUTION_REPOSITORY)
    private readonly attributionRepository: IAttributionRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepository: IAuditEventRepository,
  ) {}

  async execute(
    userId: string,
    input: RecordAttributionDto,
  ): Promise<RecordAttributionResult> {
    if (!hasSignal(input)) return { recorded: false, attribution: null };

    const { attribution, created } =
      await this.attributionRepository.recordFirstTouch({
        userId,
        visitorId: input.visitorId ?? null,
        utmSource: input.utmSource ?? null,
        utmMedium: input.utmMedium ?? null,
        utmCampaign: input.utmCampaign ?? null,
        utmContent: input.utmContent ?? null,
        utmTerm: input.utmTerm ?? null,
        referrer: input.referrer ?? null,
        landingPath: input.landingPath ?? null,
      });

    if (created) {
      await this.auditEventRepository.record({
        userId,
        eventType: ATTRIBUTION_RECORDED_EVENT,
        metadata: {
          visitorId: attribution.visitorId,
          source: attribution.utmSource,
          campaign: attribution.utmCampaign,
        },
      });
    }

    return { recorded: true, attribution };
  }
}

function hasSignal(input: RecordAttributionDto): boolean {
  return SIGNAL_FIELDS.some((field) => {
    const value = input[field];

    return typeof value === 'string' && value.length > 0;
  });
}
