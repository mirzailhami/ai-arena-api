import { Injectable } from '@nestjs/common'
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

import { FargateService } from '../fargate/fargate.service'
import { LoggerService } from '../shared/modules/global/logger.service'

@Injectable()
export class ImageBuilderService {
  private readonly logger = LoggerService.forRoot('ImageBuilderService')
  private cachedImageUri: string | null = null

  constructor(private readonly fargate: FargateService) {}

  /**
   * Builds the ai-arena Docker image and pushes it to ECR.
   * Returns the full image URI (e.g., 123456789.dkr.ecr.us-east-1.amazonaws.com/ai-arena:latest).
   */
  async buildAndPush(arenaSourceDir: string): Promise<string> {
    if (this.cachedImageUri) {
      this.logger.log({ action: 'buildAndPush.cached', uri: this.cachedImageUri })
      return this.cachedImageUri
    }

    const dockerfilePath = join(arenaSourceDir, 'Dockerfile')
    if (!existsSync(dockerfilePath)) {
      throw new Error(`Dockerfile not found at ${dockerfilePath}`)
    }

    // Ensure ECR repo exists
    const repoUri = await this.fargate.ensureEcrRepository()
    const imageTag = `${repoUri}:latest`

    this.logger.log({ action: 'buildAndPush.building', context: arenaSourceDir })

    // Build the Docker image
    try {
      execFileSync('docker', ['build', '-t', imageTag, arenaSourceDir], {
        stdio: 'pipe',
        timeout: 600000, // 10 min
      })
    } catch (error) {
      throw new Error(`Docker build failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Login to ECR
    const auth = await this.fargate.getEcrAuthToken()
    const decoded = Buffer.from(auth.token, 'base64').toString('utf-8')
    const [username, password] = decoded.split(':')

    try {
      execFileSync('docker', ['login', '--username', username, '--password-stdin', auth.endpoint], {
        input: password,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000,
      })
    } catch (error) {
      throw new Error(`ECR login failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Push image to ECR
    this.logger.log({ action: 'buildAndPush.pushing', imageTag })
    try {
      execFileSync('docker', ['push', imageTag], {
        stdio: 'pipe',
        timeout: 600000,
      })
    } catch (error) {
      throw new Error(`Docker push failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    this.cachedImageUri = imageTag
    this.logger.log({ action: 'buildAndPush.complete', imageTag })
    return imageTag
  }

  /** Returns the cached image URI if the image has been built. */
  getImageUri(): string | null {
    return this.cachedImageUri
  }
}
