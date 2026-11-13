import { Body, Controller, Post } from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { IsString, IsUUID, MaxLength } from 'class-validator';
import { AllowInactiveBilling } from '../billing';
import { NotePresenceService } from './note-presence.service';

export class NotePresenceDto {
  @IsString()
  @MaxLength(200)
  ref!: string;

  @IsUUID('4')
  sessionId!: string;
}

@Roles(['user'])
@Controller('notes/presence')
export class NotePresenceController {
  constructor(private readonly presence: NotePresenceService) {}

  // Presence protects readers too; content mutations remain billing-gated.
  @AllowInactiveBilling()
  @Post('acquire')
  acquire(@Session() session: UserSession, @Body() input: NotePresenceDto) {
    return this.presence.acquire(session.user.id, input.ref, input.sessionId);
  }

  @AllowInactiveBilling()
  @Post('release')
  release(@Session() session: UserSession, @Body() input: NotePresenceDto) {
    return this.presence.release(session.user.id, input.ref, input.sessionId);
  }
}
