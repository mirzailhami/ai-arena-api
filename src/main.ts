import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded, raw } from 'express';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Binary upload support: parse application/octet-stream bodies for the problem upload route.
  // NestJS's default body parsers (json, urlencoded) skip octet-stream, so this must be registered
  // explicitly. It runs after the default parsers which leaves the stream intact for us.
  app.use('/problem/upload', raw({ type: 'application/octet-stream', limit: '200mb' }));

  // Also keep standard parsers available for json/urlencoded routes (already added by NestJS,
  // but registering here ensures order is correct when express.raw() is in the stack).
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that are not in the DTO
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are provided
      transform: true, // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS configuration
  const corsOrigins = configService.get<string>('CORS_ORIGINS', '').split(',').filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : '*',
    credentials: true,
  });

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('AI Arena API')
    .setDescription(
      'Backend service for Topcoder AI Competition Environment - Problem Library & Tournament Management',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('library', 'Problem Library Management')
    .addTag('tourney', 'Tournament Management')
    .addTag('health', 'Health Check')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`🚀 AI Arena API is running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation available at: http://localhost:${port}/api`);
}

bootstrap();
