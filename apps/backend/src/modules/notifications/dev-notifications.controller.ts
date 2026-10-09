import { Body, Controller, HttpStatus, Logger, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { IsUUID } from 'class-validator';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { DailyBriefingService, FollowUpService } from './proactive.service';

export class DevNotificationDto {
  @IsUUID('4')
  requestId!: string;
}

@Roles(['user'])
@Controller('dev/notifications')
export class DevNotificationsController {
  private readonly logger = new Logger(DevNotificationsController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly briefings: DailyBriefingService,
    private readonly followUps: FollowUpService,
  ) {}

  @Post('daily-brief')
  async dailyBrief(
    @Session() session: UserSession,
    @Body() input: DevNotificationDto,
  ) {
    this.requireDevelopment();

    return this.summarize(
      await this.briefings.run(session.user.id, new Date(), input.requestId),
    );
  }

  @Post('follow-up')
  async followUp(
    @Session() session: UserSession,
    @Body() input: DevNotificationDto,
  ) {
    this.requireDevelopment();

    return this.summarize(
      await this.followUps.run(session.user.id, new Date(), input.requestId),
    );
  }

  private summarize(
    result:
      | Awaited<ReturnType<DailyBriefingService['run']>>
      | Awaited<ReturnType<FollowUpService['run']>>,
  ) {
    return {
      status: result.status,
      deliveryCount: result.deliveries ? result.deliveries.length : 0,
      replayed: 'replayed' in result ? result.replayed : false,
    };
  }

  private requireDevelopment(): void {
    if (this.config.get<string>('NODE_ENV') === 'development') return;
    this.logger.warn('Rejected manual notification outside development');
    throw new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Manual notifications are available only in development.',
      status: HttpStatus.NOT_FOUND,
    });
  }
}
