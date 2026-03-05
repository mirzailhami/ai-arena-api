import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Service for merging user Dockerfiles with arena base template.
 * Ports logic from Java DockerfileBuilder class (ai-arena-backend-api).
 *
 * Key responsibilities:
 * - Read user Dockerfile from submission
 * - Merge with arena base template (FROM java:latest, COPY synthetica2.war, etc.)
 * - Copy synthetica2.war into Docker context (if ARENA_SYNTHETICA_WAR_PATH configured)
 * - Write final Dockerfile to build context
 */
@Injectable()
export class DockerfileMergeService {
  private readonly logger = new Logger(DockerfileMergeService.name);
  private readonly arenaWarPath: string | undefined;

  constructor(private configService: ConfigService) {
    this.arenaWarPath = configService.get<string>('storage.arenaWarPath');
    if (this.arenaWarPath) {
      this.logger.log(`Arena synthetica2.war configured at: ${this.arenaWarPath}`);
    }
  }

  /**
   * Merges user Dockerfile with arena base template.
   * Creates final Dockerfile in the Docker context directory.
   *
   * @param userDockerfilePath - Path to user's original Dockerfile
   * @param contextPath - Docker build context directory (where final Dockerfile will be written)
   * @returns Path to the final merged Dockerfile
   */
  async mergeDockerfile(userDockerfilePath: string, contextPath: string): Promise<string> {
    try {
      // Read user's Dockerfile
      const userContent = await fs.readFile(userDockerfilePath, 'utf-8');
      this.logger.log(`Read user Dockerfile (${userContent.length} bytes)`);

      // Build arena base template
      const arenaBase = this.buildArenaBaseTemplate();

      // Merge: arena base + user content
      const mergedContent = `${arenaBase}\n\n# === User Dockerfile ===\n${userContent}`;

      // Copy synthetica2.war if configured
      if (this.arenaWarPath) {
        await this.copySyntheticaWar(contextPath);
      }

      // Write final Dockerfile
      const finalDockerfilePath = path.join(contextPath, 'Dockerfile.merged');
      await fs.writeFile(finalDockerfilePath, mergedContent, 'utf-8');
      this.logger.log(`Wrote merged Dockerfile to: ${finalDockerfilePath}`);

      return finalDockerfilePath;
    } catch (error) {
      this.logger.error(`Failed to merge Dockerfile: ${error.message}`);
      throw new Error(`Dockerfile merge failed: ${error.message}`);
    }
  }

  /**
   * Builds the arena base template with JRE and synthetica2.war setup.
   * Based on arena-manager/config/arena-image-baseline from Part 1.
   *
   * @returns Arena base Dockerfile content
   */
  private buildArenaBaseTemplate(): string {
    const lines = [
      '# Arena Base Template (auto-generated)',
      '# Based on ai-arena-backend-api/config/arena-image-baseline',
      '',
      '# Use Java 21 runtime',
      'FROM eclipse-temurin:21-jre-alpine',
      '',
      '# Install basic utilities',
      'RUN apk add --no-cache bash curl',
      '',
    ];

    // Add synthetica2.war copy instruction if configured
    if (this.arenaWarPath) {
      lines.push(
        '# Copy arena competition engine (synthetica2.war)',
        'COPY synthetica2.war /opt/arena/synthetica2.war',
        '',
      );
    }

    lines.push(
      '# Set working directory',
      'WORKDIR /workspace',
      '',
      '# Default environment variables',
      'ENV ARENA_ENGINE_JAR=/opt/arena/synthetica2.war',
      '',
    );

    return lines.join('\n');
  }

  /**
   * Copies synthetica2.war from configured path into Docker build context.
   *
   * @param contextPath - Docker build context directory
   */
  private async copySyntheticaWar(contextPath: string): Promise<void> {
    if (!this.arenaWarPath) return;

    try {
      const destPath = path.join(contextPath, 'synthetica2.war');
      await fs.copyFile(this.arenaWarPath, destPath);
      this.logger.log(`Copied synthetica2.war to build context: ${destPath}`);
    } catch (error) {
      // Don't fail the build if synthetica2.war copy fails (may not be required for all problems)
      this.logger.warn(`Failed to copy synthetica2.war: ${error.message}`);
    }
  }
}
