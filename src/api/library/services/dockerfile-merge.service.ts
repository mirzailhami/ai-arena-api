import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Service for merging user Dockerfiles with the arena base template.
 * Ports logic from Java DockerfileBuilder class (ai-arena-backend-api).
 *
 * Key behaviours (matching Java source exactly):
 * - Base image: tomcat:9.0.80-jdk11-temurin with full build toolchain
 * - synthetica2.war is added to /usr/local/tomcat/webapps/ when available
 * - The first line (FROM) of the user Dockerfile is skipped during merge
 * - All remaining user instructions are appended after the base
 */
@Injectable()
export class DockerfileMergeService {
  private readonly logger = new Logger(DockerfileMergeService.name);
  private readonly arenaWarPath: string | undefined;

  // Arena Base Dockerfile (Standardized Environment) — matches Java DockerfileBuilder.ARENA_BASE_DOCKERFILE_TEMPLATE
  private static readonly ARENA_BASE_TEMPLATE =
    'FROM tomcat:9.0.80-jdk11-temurin\n' +
    'ENV DEBIAN_FRONTEND=noninteractive\n' +
    'RUN apt-get update && apt-get install -y --no-install-recommends ' +
    '    curl gnupg build-essential maven python3 python3-pip && rm -rf /var/lib/apt/lists/*\n' +
    'RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && apt-get install -y nodejs\n' +
    'RUN node -v\n' +
    'RUN npm -v\n' +
    'RUN python3 --version\n' +
    'RUN pip3 --version\n' +
    'RUN mvn --version\n' +
    'WORKDIR /app\n' +
    'RUN rm -rf /usr/local/tomcat/webapps/*\n' +
    '%WAR_LINE%' +
    'EXPOSE 8080\n' +
    'CMD ["catalina.sh", "run"]';

  constructor(private configService: ConfigService) {
    this.arenaWarPath = configService.get<string>('storage.arenaWarPath');
    if (this.arenaWarPath) {
      this.logger.log(`Arena synthetica2.war configured at: ${this.arenaWarPath}`);
    }
  }

  /**
   * Merges user Dockerfile with the arena base template.
   * Creates final Dockerfile in the Docker context directory.
   *
   * @param userDockerfilePath - Path to user's original Dockerfile
   * @param contextPath - Docker build context directory (where final Dockerfile will be written)
   * @returns Path to the final merged Dockerfile
   */
  async mergeDockerfile(userDockerfilePath: string, contextPath: string): Promise<string> {
    try {
      const userContent = await fs.readFile(userDockerfilePath, 'utf-8');
      this.logger.log(`Read user Dockerfile (${userContent.length} bytes)`);

      // Copy synthetica2.war into context before building template
      const includeWar = await this.copySyntheticaWar(contextPath);

      const mergedContent = this.buildMergedDockerfile(userContent, includeWar);

      const finalDockerfilePath = path.join(contextPath, 'Dockerfile.merged');
      await fs.writeFile(finalDockerfilePath, mergedContent, 'utf-8');
      this.logger.log(`Wrote merged Dockerfile to: ${finalDockerfilePath}`);

      return finalDockerfilePath;
    } catch (error) {
      this.logger.error(`Failed to merge Dockerfile: ${(error as Error).message}`);
      throw new Error(`Dockerfile merge failed: ${(error as Error).message}`);
    }
  }

  /**
   * Merges the arena base with the problem Dockerfile content.
   * Skips the first line (FROM instruction) of the problem file — matches Java mergeWithBase().
   */
  private buildMergedDockerfile(problemDockerfileContent: string, includeWar: boolean): string {
    const warLine = includeWar
      ? 'ADD synthetica2.war /usr/local/tomcat/webapps/synthetica2.war\n'
      : '# synthetica2.war not available - ADD skipped\n';

    const arenaBase = DockerfileMergeService.ARENA_BASE_TEMPLATE.replace('%WAR_LINE%', warLine);

    if (!problemDockerfileContent || !problemDockerfileContent.trim()) {
      return arenaBase;
    }

    // Skip the first line (the problem's FROM instruction) — matches Java behaviour
    const problemLines = problemDockerfileContent.split(/\r?\n/);
    const problemInstructions = problemLines.slice(1).join('\n');

    return `${arenaBase}\n\n# --- PROBLEM-SPECIFIC INSTRUCTIONS ---\n${problemInstructions}`;
  }

  /**
   * Copies synthetica2.war from configured path into Docker build context.
   * Returns true if the file was successfully copied.
   */
  private async copySyntheticaWar(contextPath: string): Promise<boolean> {
    if (!this.arenaWarPath) return false;

    try {
      const destPath = path.join(contextPath, 'synthetica2.war');
      await fs.copyFile(this.arenaWarPath, destPath);
      this.logger.log(`Copied synthetica2.war to build context: ${destPath}`);
      return true;
    } catch (error) {
      this.logger.warn(`Failed to copy synthetica2.war: ${(error as Error).message}`);
      return false;
    }
  }
}
