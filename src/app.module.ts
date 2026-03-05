import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LibraryModule } from './api/library/library.module';
import { TourneyModule } from './api/tourney/tourney.module';
import configuration from './config/configuration';
import { HealthController } from './health.controller';
import { AuthModule, JwtAuthGuard } from './shared/modules/auth';
import { GlobalProvidersModule } from './shared/modules/global/globalProviders.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    GlobalProvidersModule,
    AuthModule,
    LibraryModule,
    TourneyModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
