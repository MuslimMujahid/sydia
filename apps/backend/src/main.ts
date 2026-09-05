import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { ResponseInterceptor } from './shared/response';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './shared/errors';

async function bootstrap(): Promise<void> {
  // Body parser is disabled app-wide: Better Auth needs the raw request
  // body on /api/auth/*, and @thallesp/nestjs-better-auth re-adds the
  // default json/urlencoded parsers for all other routes.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: `http://localhost:${configService.get<number>('FRONTEND_PORT', 3000)}`,
    credentials: true,
  });
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const allExceptionsFilter = app.get(AllExceptionsFilter);
  const responseInterceptor = app.get(ResponseInterceptor);

  app.useGlobalFilters(allExceptionsFilter);
  app.useGlobalInterceptors(responseInterceptor);
  app.enableShutdownHooks();

  const port = configService.get<number>('BACKEND_PORT', 5000);
  await app.listen(port);
}

void bootstrap();
