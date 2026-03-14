import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { ConfigModule } from '@nestjs/config'

import { PrismaModule } from './prisma/prisma.module'
import { ProblemsModule } from './problems/problems.module'
import { TournamentsModule } from './tournaments/tournaments.module'
import { PublishingModule } from './publishing/publishing.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    ProblemsModule,
    TournamentsModule,
    PublishingModule,
  ],
})
export class AppModule {}
