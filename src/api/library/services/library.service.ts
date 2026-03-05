import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Problem } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '@/shared/modules/global/prisma.service';
import { DockerTestResult } from '../interfaces';
import { DockerfileMergeService } from './dockerfile-merge.service';
import { DockerTestService } from './docker-test.service';
import { ZipValidatorService } from './zip-validator.service';

// Problem status constants from Prisma schema
const ProblemStatus = {
  PendingTest: 'Pending Test',
  Testing: 'Testing',
  Passed: 'Passed',
  Failed: 'Failed',
} as const;

/**
 * Service for managing problem library operations.
 * Orchestrates the full problem upload, validation, and Docker testing workflow.
 *
 * Ports logic from Java ProblemManagerResource (ai-arena-backend-api).
 *
 * Key workflows:
 * - Upload problem ZIP → validate → test with Docker → store in database
 * - Retrieve problem metadata and logs
 * - Delete problems
 * - Flag problems for re-testing
 */
@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);
  private readonly problemsRoot: string;

  constructor(
    private prisma: PrismaService,
    private zipValidator: ZipValidatorService,
    private dockerfileMerge: DockerfileMergeService,
    private dockerTest: DockerTestService,
    private configService: ConfigService,
  ) {
    this.problemsRoot = configService.get<string>('storage.problemsRoot', '/tmp/problems');
  }

  /**
   * Uploads a new problem ZIP and initiates testing workflow.
   *
   * @param zipBuffer - Uploaded ZIP file buffer
   * @param problemName - Human-readable problem name (from X-Problem-Name header)
   * @param zipFileName - Original ZIP filename (from Content-Disposition)
   * @param userId - Uploader user ID
   * @returns Created problem record (status: Pending Test)
   */
  async uploadProblem(
    zipBuffer: Buffer,
    problemName: string,
    zipFileName: string,
    userId: string,
  ): Promise<Problem> {
    // Create problem record
    const problem = await this.prisma.problem.create({
      data: {
        name: problemName,
        zipFileName: zipFileName,
        zipFilePath: '', // Will update after saving ZIP
        status: ProblemStatus.PendingTest,
        createdBy: userId,
      },
    });

    const problemId = problem.id; // already a string (UUID)

    // Save ZIP file to disk
    const zipDir = path.join(this.problemsRoot, problemId);
    await fs.mkdir(zipDir, { recursive: true });
    const zipPath = path.join(zipDir, zipFileName);
    await fs.writeFile(zipPath, zipBuffer);

    // Update problem with ZIP path
    await this.prisma.problem.update({
      where: { id: problem.id },
      data: { zipFilePath: zipPath },
    });

    this.logger.log(
      `Problem ${problemId} uploaded: ${problemName} / ${zipFileName} (${zipBuffer.length} bytes)`,
    );

    return problem;
  }

  /**
   * Tests a problem by extracting ZIP, validating structure, and running Docker build/test.
   *
   * @param problemId - Problem ID to test
   * @returns Docker test result
   */
  async testProblem(problemId: string): Promise<DockerTestResult> {
    const problem = await this.prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      throw new NotFoundException(`Problem ${problemId} not found`);
    }

    this.logger.log(`Starting test for problem ${problemId}...`);

    // Update status to Testing
    await this.prisma.problem.update({
      where: { id: problemId },
      data: { status: ProblemStatus.Testing, isTested: true },
    });

    try {
      // 1. Load ZIP buffer
      if (!problem.zipFilePath) {
        throw new Error('Problem has no ZIP file path');
      }
      const zipBuffer = await fs.readFile(problem.zipFilePath);

      // 2. Validate and extract ZIP
      const validation = await this.zipValidator.validateAndExtract(zipBuffer, problemId);

      if (!validation.isValid) {
        // Validation failed
        await this.prisma.problem.update({
          where: { id: problemId },
          data: {
            status: ProblemStatus.Failed,
            buildLog: `ZIP validation failed: ${validation.error}`,
          },
        });

        return {
          buildSuccess: false,
          testPassed: false,
          buildLog: validation.error || 'Unknown validation error',
          runtimeLog: '',
          exitCode: -1,
          durationMs: 0,
        };
      }

      // 3. Merge Dockerfile with arena base template
      const mergedDockerfilePath = await this.dockerfileMerge.mergeDockerfile(
        validation.dockerfilePath,
        validation.dockerContextPath,
      );

      // 4. Run Docker build + test
      const testResult = await this.dockerTest.runDockerTest(
        mergedDockerfilePath,
        validation.dockerContextPath,
        problemId,
      );

      // 5. Update problem status based on test result
      // isContestReady: set true on pass, never reverted on failure ("once validated, always validated")
      const finalStatus = testResult.testPassed ? ProblemStatus.Passed : ProblemStatus.Failed;

      await this.prisma.problem.update({
        where: { id: problemId },
        data: {
          status: finalStatus,
          buildLog: `${testResult.buildLog}\n\n=== Runtime Output ===\n${testResult.runtimeLog}`,
          ...(testResult.testPassed && { isContestReady: true }),
        },
      });

      this.logger.log(
        `Problem ${problemId} test completed: ${finalStatus} (${testResult.durationMs}ms)`,
      );

      return testResult;
    } catch (error) {
      this.logger.error(`Problem ${problemId} test error:`, error);

      await this.prisma.problem.update({
        where: { id: problemId },
        data: {
          status: ProblemStatus.Failed,
          buildLog: `Test error: ${error.message}`,
        },
      });

      return {
        buildSuccess: false,
        testPassed: false,
        buildLog: `Test error: ${error.message}`,
        runtimeLog: '',
        exitCode: -1,
        durationMs: 0,
      };
    }
  }

  /**
   * Retrieves all problems from the library.
   *
   * @returns List of all problems
   */
  async getAllProblems(): Promise<Problem[]> {
    return this.prisma.problem.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Retrieves a single problem by ID.
   *
   * @param problemId - Problem ID
   * @returns Problem record
   */
  async getProblemById(problemId: string): Promise<Problem> {
    const problem = await this.prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      throw new NotFoundException(`Problem ${problemId} not found`);
    }
    return problem;
  }

  /**
   * Retrieves build/test logs for a problem.
   *
   * @param problemId - Problem ID
   * @returns Build log content
   */
  async getProblemLog(problemId: string): Promise<string> {
    const problem = await this.getProblemById(problemId);
    return problem.buildLog || 'No logs available';
  }

  /**
   * Deletes a problem and its associated files.
   *
   * @param problemId - Problem ID to delete
   */
  async deleteProblem(problemId: string): Promise<void> {
    const problem = await this.getProblemById(problemId);

    // Delete files
    const problemDir = path.join(this.problemsRoot, problemId);
    try {
      await fs.rm(problemDir, { recursive: true, force: true });
      this.logger.log(`Deleted problem directory: ${problemDir}`);
    } catch (error) {
      this.logger.warn(`Failed to delete problem directory ${problemDir}: ${error.message}`);
    }

    // Delete database record
    await this.prisma.problem.delete({ where: { id: problemId } });
    this.logger.log(`Deleted problem ${problemId} from database`);
  }

  /**
   * Manually sets the isContestReady flag for a problem.
   * Used by the platform-UI "Flag for Contest" / "Unflag" button.
   *
   * @param problemId - Problem ID
   * @param flag - true = mark contest-ready, false = unmark
   * @returns Updated problem record
   */
  async setContestReady(problemId: string, flag: boolean): Promise<Problem> {
    await this.getProblemById(problemId); // ensure exists (throws 404 if not)
    return this.prisma.problem.update({
      where: { id: problemId },
      data: { isContestReady: flag },
    });
  }
}
