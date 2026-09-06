import { Module } from '@nestjs/common';
import { LANGUAGE_MODEL } from './model-gateway.types';
import { OpenRouterLanguageModel } from './openrouter-language-model';

@Module({
  providers: [
    OpenRouterLanguageModel,
    {
      provide: LANGUAGE_MODEL,
      useExisting: OpenRouterLanguageModel,
    },
  ],
  exports: [LANGUAGE_MODEL],
})
export class ModelGatewayModule {}
