import { Module } from '@nestjs/common'

import { PrismaModule } from './prisma/prisma.module'
import { ProblemsModule } from './problems/problems.module'
import { TournamentsModule } from './tournaments/tournaments.module'

@Module({
  imports: [PrismaModule, ProblemsModule, TournamentsModule],
})
export class AppModule {}
