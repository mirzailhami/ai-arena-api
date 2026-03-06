import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded, raw } from 'express';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  // Disable default body parsers so we can configure them with full control
  // (strict: false is needed to accept raw boolean JSON bodies, e.g. POST /problem/flag/:id)
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);

  // Global prefix matches Java WAR: context path /arena-manager + @ApplicationPath /api
  app.setGlobalPrefix('arena-manager/api');

  // Binary upload support — path must include the global prefix since app.use() is Express-level.
  app.use('/arena-manager/api/problem/upload', raw({ type: 'application/octet-stream', limit: '200mb' }));

  // JSON parser with strict:false so raw boolean/null/string/number JSON values are accepted
  // (by default express/body-parser strict:true only allows objects and arrays)
  app.use(json({ strict: false, limit: '10mb' }));
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
    allowedHeaders: ['Content-Type', 'Authorization', 'sessionId', 'X-Problem-Name', 'Content-Disposition'],
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
  console.log(`🚀 AI Arena API is running on: http://localhost:${port}/arena-manager/api`);
  console.log(`📚 Swagger documentation available at: http://localhost:${port}/api`);
}

bootstrap();
