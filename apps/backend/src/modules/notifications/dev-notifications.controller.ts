import { Body, Controller, HttpStatus, Logger, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { DailyBriefingService, FollowUpService } from './proactive.service';
import { SecretaryBackgroundService } from './secretary-background.service';

export class DevNotificationDto {
  @IsUUID('4')
  requestId!: string;
}

export class DevSecretarySweepDto {
  /** Controlled clock for QA harnesses only; never derived from chat text. */
  @IsOptional()
  @IsISO8601()
  at?: string;
}

@Roles(['user'])
@Controller('dev/notifications')
export class DevNotificationsController {
  private readonly logger = new Logger(DevNotificationsController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly briefings: DailyBriefingService,
    private readonly followUps: FollowUpService,
    private readonly secretary: SecretaryBackgroundService,
  ) {}

  /** Runs the background secretary evaluation for the signed-in owner only. */
  @Post('secretary-sweep')
  async secretarySweep(
    @Session() session: UserSession,
    @Body() input: DevSecretarySweepDto,
  ) {
    this.requireDevelopment();

    return {
      decisions: await this.secretary.sweep(
        input.at ? new Date(input.at) : new Date(),
        session.user.id,
      ),
    };
  }

  @Post('daily-brief')
  async dailyBrief(
    @Session() session: UserSession,
    @Body() input: DevNotificationDto,
  ) {
    this.requireDevelopment();

    return this.summarize(
      await this.briefings.run(
        session.user.id,
        new Date(),
        input.requestId,
        'daily',
      ),
    );
  }

  @Post('weekly-brief')
  async weeklyBrief(
    @Session() session: UserSession,
    @Body() input: DevNotificationDto,
  ) {
    this.requireDevelopment();

    return this.summarize(
      await this.briefings.run(
        session.user.id,
        new Date(),
        input.requestId,
        'weekly',
      ),
    );
  }

  @Post('daily-weekly-brief')
  async dailyWeeklyBrief(
    @Session() session: UserSession,
    @Body() input: DevNotificationDto,
  ) {
    this.requireDevelopment();

    return this.summarize(
      await this.briefings.run(
        session.user.id,
        new Date(),
        input.requestId,
        'daily_weekly',
      ),
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
