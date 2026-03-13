import { Module } from '@nestjs/common'

import { FargateModule } from '../fargate/fargate.module'
import { PublishingEngineService } from './publishing-engine.service'

@Module({
  imports: [FargateModule],
  exports: [PublishingEngineService],
  providers: [PublishingEngineService],
})
export class PublishingModule {}
