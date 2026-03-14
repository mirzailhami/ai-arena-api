import { Module } from '@nestjs/common'

import { FargateModule } from '../fargate/fargate.module'
import { PublishingEngineService } from './publishing-engine.service'
import { SchedulerService } from './scheduler.service'
import { SqsService } from './sqs.service'

@Module({
  exports: [PublishingEngineService],
  imports: [FargateModule],
  providers: [PublishingEngineService, SchedulerService, SqsService],
})
export class PublishingModule {}
