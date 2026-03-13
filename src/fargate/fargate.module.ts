import { Module } from '@nestjs/common'

import { FargateService } from './fargate.service'

@Module({
  exports: [FargateService],
  providers: [FargateService],
})
export class FargateModule {}
