import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { DockerTestResult } from '../interfaces/docker-test-result.interface';

/**
 * Service for executing Docker build/run/inspect/rm testing cycle.
 * Ports logic from Java backend Docker integration (ProblemManagerResource).
 *
 * Key responsibilities:
 * - Build Docker image from Dockerfile
 * - Run container with timeout enforcement
 * - Capture build logs and runtime output
 * - Inspect container for exit code and metadata
 * - Clean up containers and images
 */
@Injectable()
export class DockerTestService {
  private readonly logger = new Logger(DockerTestService.name);
  private readonly DEFAULT_TIMEOUT_MS = 60000; // 60 seconds

  /**
   * Executes full Docker test cycle for a problem submission.
   *
   * @param dockerfilePath - Path to Dockerfile (or merged Dockerfile)
   * @param contextPath - Docker build context directory
   * @param problemId - Unique problem ID (used for image/container naming)
   * @param timeoutMs - Maximum execution time for container (default 60s)
   * @returns Test result with logs and status
   */
  async runDockerTest(
    dockerfilePath: string,
    contextPath: string,
    problemId: string,
    timeoutMs: number = this.DEFAULT_TIMEOUT_MS,
  ): Promise<DockerTestResult> {
    const startTime = Date.now();
    const imageName = `arena-problem-${problemId}:latest`;
    const containerName = `arena-test-${problemId}`;

    let buildLog = '';
    let runtimeLog = '';
    let runtimeError = '';
    let imageId = '';
    let containerId = '';
    let exitCode = -1;

    try {
      // 1. Docker build
      this.logger.log(`Building Docker image for problem ${problemId}...`);
      const buildResult = await this.dockerBuild(dockerfilePath, contextPath, imageName);
      buildLog = buildResult.log;

      if (!buildResult.success) {
        return {
          buildSuccess: false,
          testPassed: false,
          buildLog,
          runtimeLog: '',
          exitCode: -1,
          durationMs: Date.now() - startTime,
        };
      }

      imageId = buildResult.imageId || '';
      this.logger.log(`Docker build succeeded. Image ID: ${imageId}`);

      // 2. Docker run
      this.logger.log(`Running Docker container for problem ${problemId}...`);
      const runResult = await this.dockerRun(imageName, containerName, timeoutMs);
      runtimeLog = runResult.stdout;
      runtimeError = runResult.stderr;
      containerId = runResult.containerId || '';

      // 3. Docker inspect (get exit code)
      if (containerId) {
        exitCode = await this.dockerInspectExitCode(containerId);
        this.logger.log(`Container ${containerId} exited with code ${exitCode}`);
      }

      // 4. Clean up
      await this.cleanup(containerId, imageId);

      return {
        buildSuccess: true,
        testPassed: exitCode === 0,
        buildLog,
        runtimeLog,
        runtimeError: runtimeError || undefined,
        exitCode,
        imageId,
        containerId,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error(`Docker test failed for problem ${problemId}:`, error);

      // Attempt cleanup even on error
      try {
        await this.cleanup(containerName, imageName);
      } catch {
        /* ignore cleanup errors */
      }

      return {
        buildSuccess: false,
        testPassed: false,
        buildLog: buildLog || `Docker test error: ${error.message}`,
        runtimeLog: runtimeLog || '',
        runtimeError: error.message,
        exitCode: -1,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Executes `docker build` command.
   *
   * @param dockerfilePath - Path to Dockerfile
   * @param contextPath - Build context directory
   * @param imageName - Name for the built image
   * @returns Build result with success flag and logs
   */
  private async dockerBuild(
    dockerfilePath: string,
    contextPath: string,
    imageName: string,
  ): Promise<{ success: boolean; log: string; imageId?: string }> {
    return new Promise((resolve) => {
      let log = '';
      let imageId = '';

      const proc = spawn('docker', ['build', '-f', dockerfilePath, '-t', imageName, contextPath], {
        cwd: contextPath,
      });

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        log += text;
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        log += text;
      });

      proc.on('close', (code) => {
        // Extract image ID from build log (Docker outputs "Successfully built <imageId>")
        const match = log.match(/Successfully built ([a-f0-9]{12})/);
        if (match) {
          imageId = match[1];
        }

        resolve({
          success: code === 0,
          log,
          imageId,
        });
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          log: `Docker build spawn error: ${err.message}`,
        });
      });
    });
  }

  /**
   * Executes `docker run` command with timeout enforcement.
   *
   * @param imageName - Docker image to run
   * @param containerName - Name for the container
   * @param timeoutMs - Maximum execution time
   * @returns Run result with stdout, stderr, and container ID
   */
  private async dockerRun(
    imageName: string,
    containerName: string,
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; containerId?: string }> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let containerId = '';
      let timedOut = false;

      const proc = spawn('docker', ['run', '--name', containerName, '--rm', imageName]);

      // Timeout enforcement
      const timeout = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        stderr += `\n[Timeout: Container killed after ${timeoutMs}ms]`;
      }, timeoutMs);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, containerId });
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          stdout,
          stderr: stderr + `\nDocker run spawn error: ${err.message}`,
        });
      });
    });
  }

  /**
   * Inspects container to retrieve exit code.
   *
   * @param containerId - Container ID or name
   * @returns Container exit code
   */
  private async dockerInspectExitCode(containerId: string): Promise<number> {
    return new Promise((resolve) => {
      const proc = spawn('docker', [
        'inspect',
        '--format',
        '{{.State.ExitCode}}',
        containerId,
      ]);

      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          const exitCode = parseInt(output.trim(), 10);
          resolve(isNaN(exitCode) ? -1 : exitCode);
        } else {
          resolve(-1);
        }
      });

      proc.on('error', () => {
        resolve(-1);
      });
    });
  }

  /**
   * Cleans up Docker container and image.
   *
   * @param containerNameOrId - Container to remove
   * @param imageNameOrId - Image to remove
   */
  private async cleanup(containerNameOrId: string, imageNameOrId: string): Promise<void> {
    if (containerNameOrId) {
      try {
        await this.execDockerCommand(['rm', '-f', containerNameOrId]);
        this.logger.log(`Cleaned up container: ${containerNameOrId}`);
      } catch (error) {
        this.logger.warn(`Failed to remove container ${containerNameOrId}: ${error.message}`);
      }
    }

    if (imageNameOrId) {
      try {
        await this.execDockerCommand(['rmi', '-f', imageNameOrId]);
        this.logger.log(`Cleaned up image: ${imageNameOrId}`);
      } catch (error) {
        this.logger.warn(`Failed to remove image ${imageNameOrId}: ${error.message}`);
      }
    }
  }

  /**
   * Executes a Docker command and returns the result.
   *
   * @param args - Docker command arguments
   * @returns Command output
   */
  private async execDockerCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';

      const proc = spawn('docker', args);

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Docker command failed with code ${code}: ${output}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }
}
