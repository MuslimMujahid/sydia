import { Module } from '@nestjs/common';
import { LANGUAGE_MODEL } from './model-gateway.types';
import { OpenRouterLanguageModel } from './openrouter-language-model';
import { OpenRouterMediaService } from './openrouter-media.service';

@Module({
  providers: [
    OpenRouterLanguageModel,
    OpenRouterMediaService,
    {
      provide: LANGUAGE_MODEL,
      useExisting: OpenRouterLanguageModel,
    },
  ],
  exports: [LANGUAGE_MODEL, OpenRouterMediaService],
})
export class ModelGatewayModule {}
