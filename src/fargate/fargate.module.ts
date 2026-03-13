import { Module } from '@nestjs/common'

import { FargateService } from './fargate.service'
import { ImageBuilderService } from './image-builder.service'

@Module({
  exports: [FargateService, ImageBuilderService],
  providers: [FargateService, ImageBuilderService],
})
export class FargateModule {}
