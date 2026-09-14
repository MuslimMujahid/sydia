import { Module } from '@nestjs/common';
import {
  CONTACT_GROUP_REPOSITORY,
  CONTACT_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaContactGroupRepository,
  PrismaContactRepository,
} from '../../database/repositories';
import {
  ContactGroupsController,
  ContactsController,
} from './contacts.controller';

@Module({
  controllers: [ContactsController, ContactGroupsController],
  providers: [
    { provide: CONTACT_REPOSITORY, useClass: PrismaContactRepository },
    {
      provide: CONTACT_GROUP_REPOSITORY,
      useClass: PrismaContactGroupRepository,
    },
  ],
  exports: [CONTACT_REPOSITORY, CONTACT_GROUP_REPOSITORY],
})
export class ContactsModule {}
