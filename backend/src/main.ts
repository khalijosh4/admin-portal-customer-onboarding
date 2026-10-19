import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection (non-fatal):', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception (non-fatal):', err.message);
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const config = app.get(ConfigService);

  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const isDev = nodeEnv !== 'production';

  const corsOrigins = isDev
    ? true
    : [
        config.get<string>('FRONTEND_URL', 'http://localhost:5175'),
        config.get<string>('ADMIN_FRONTEND_URL', 'http://localhost:5175'),
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5175',
      ].filter(Boolean) as string[];

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const port = config.get<number>('PORT', 5000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Fortune Sacco Admin Portal API running on http://localhost:${port}/api`);
}
bootstrap();
