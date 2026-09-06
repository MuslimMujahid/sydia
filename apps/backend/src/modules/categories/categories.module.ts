import { Global, Module } from '@nestjs/common';
import { CATEGORY_REPOSITORY } from '../../database/interfaces';
import { PrismaCategoryRepository } from '../../database/repositories';
import { CategoriesController } from './categories.controller';

@Global()
@Module({
  controllers: [CategoriesController],
  providers: [
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
  ],
  exports: [CATEGORY_REPOSITORY],
})
export class CategoriesModule {}
