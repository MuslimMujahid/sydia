import { Module } from '@nestjs/common';
import { CONTACT_REPOSITORY } from '../../database/interfaces';
import { PrismaContactRepository } from '../../database/repositories';
import { ContactsController } from './contacts.controller';

@Module({
  controllers: [ContactsController],
  providers: [
    { provide: CONTACT_REPOSITORY, useClass: PrismaContactRepository },
  ],
  exports: [CONTACT_REPOSITORY],
})
export class ContactsModule {}
