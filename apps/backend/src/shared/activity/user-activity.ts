import {
  Inject,
  Injectable,
  Logger,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { concatMap, type Observable } from 'rxjs';
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../database/interfaces';

export type ActivityFeature =
  | 'tasks'
  | 'reminders'
  | 'memories'
  | 'notes'
  | 'documents'
  | 'contacts'
  | 'calendar';
export const ACTIVITY_FEATURE = 'sydia:user-activity';
export const RecordUserActivity = (feature: ActivityFeature) =>
  SetMetadata(ACTIVITY_FEATURE, feature);

/** Runs only on explicitly annotated successful HTTP writes, never assistant tools or scheduled jobs. */
@Injectable()
export class UserActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(UserActivityInterceptor.name);
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly events: IAuditEventRepository,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const feature = this.reflector.get<ActivityFeature | undefined>(
      ACTIVITY_FEATURE,
      context.getHandler(),
    );

    if (!feature) return next.handle();
    const request = context
      .switchToHttp()
      .getRequest<{ session?: UserSession }>();

    const userId = request.session?.user.id;

    if (!userId) {
      this.logger.error('An activity-tracked write has no authenticated user');
      throw new Error('Activity tracking requires an authenticated user');
    }

    return next.handle().pipe(
      concatMap(async (result: unknown) => {
        try {
          await this.events.record({
            userId,
            eventType: 'user.activity',
            metadata: { feature },
          });
        } catch (error) {
          this.logger.error(
            `Could not persist ${feature} activity for user ${userId}`,
            error,
          );
          throw error;
        }

        return result;
      }),
    );
  }
}
