import { Module } from '@nestjs/common'

import { PrismaModule } from '../prisma/prisma.module'
import { PublishingModule } from '../publishing/publishing.module'
import { TournamentsController } from './tournaments.controller'
import { TournamentsService } from './tournaments.service'

@Module({
  controllers: [TournamentsController],
  imports: [PrismaModule, PublishingModule],
  providers: [TournamentsService],
})
export class TournamentsModule {}
