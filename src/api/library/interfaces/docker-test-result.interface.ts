/**
 * Result of Docker container testing.
 * Contains build logs, test execution status, and container metadata.
 */
export interface DockerTestResult {
  /** Whether the Docker build succeeded */
  buildSuccess: boolean;

  /** Whether the container execution succeeded (exit code 0) */
  testPassed: boolean;

  /** Docker build logs (stdout + stderr) */
  buildLog: string;

  /** Container runtime logs (stdout) */
  runtimeLog: string;

  /** Container runtime errors (stderr) */
  runtimeError?: string;

  /** Container exit code */
  exitCode: number;

  /** Docker image ID (if build succeeded) */
  imageId?: string;

  /** Container ID (if run succeeded) */
  containerId?: string;

  /** Total test duration (ms) */
  durationMs: number;
}
