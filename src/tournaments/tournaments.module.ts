import { Module } from '@nestjs/common'

import { PrismaModule } from '../prisma/prisma.module'
import { TournamentsController } from './tournaments.controller'
import { TournamentsService } from './tournaments.service'

@Module({
  controllers: [TournamentsController],
  imports: [PrismaModule],
  providers: [TournamentsService],
})
export class TournamentsModule {}
