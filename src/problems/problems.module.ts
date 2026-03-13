import { Module } from '@nestjs/common'

import { PrismaModule } from '../prisma/prisma.module'
import { ProblemsController } from './problems.controller'
import { ProblemsService } from './problems.service'

@Module({
  controllers: [ProblemsController],
  exports: [ProblemsService],
  imports: [PrismaModule],
  providers: [ProblemsService],
})
export class ProblemsModule {}
