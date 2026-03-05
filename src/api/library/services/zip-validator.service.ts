import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import AdmZip from 'adm-zip';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ZipValidationResult } from '../interfaces';

/**
 * Service for validating and extracting ZIP files containing problem submissions.
 * Ports logic from Java ZipExploder class (ai-arena-backend-api).
 *
 * Key responsibilities:
 * - Extract ZIP to temporary directory
 * - Locate Dockerfile (support nested structures)
 * - Find effective Docker context path
 * - Detect submission language
 * - Validate required files exist
 */
@Injectable()
export class ZipValidatorService {
  private readonly logger = new Logger(ZipValidatorService.name);
  private readonly problemsRoot: string;

  constructor(private configService: ConfigService) {
    this.problemsRoot = configService.get<string>('storage.problemsRoot', '/tmp/problems');
  }

  /**
   * Validates and extracts a ZIP file for Docker build preparation.
   *
   * @param zipBuffer - Buffer containing the uploaded ZIP file
   * @param problemId - Unique problem ID (for creating extraction directory)
   * @returns Validation result with paths and metadata
   */
  async validateAndExtract(zipBuffer: Buffer, problemId: string): Promise<ZipValidationResult> {
    const extractPath = path.join(this.problemsRoot, problemId, 'extracted');

    try {
      // Clean extraction directory if it exists
      try {
        await fs.rm(extractPath, { recursive: true, force: true });
      } catch {
        // Ignore if doesn't exist
      }

      // Extract ZIP
      const zip = new AdmZip(zipBuffer);
      zip.extractAllTo(extractPath, true);
      this.logger.log(`Extracted ZIP for problem ${problemId} to ${extractPath}`);

      // Find Dockerfile (may be in root or nested directories)
      const dockerfilePath = await this.findDockerfile(extractPath);
      if (!dockerfilePath) {
        return {
          isValid: false,
          error: 'No Dockerfile found in ZIP. Dockerfile must exist in root or subdirectory.',
          dockerContextPath: extractPath,
          dockerfilePath: '',
        };
      }

      // Determine effective Docker context (directory containing Dockerfile)
      const dockerContextPath = path.dirname(dockerfilePath);
      this.logger.log(`Found Dockerfile at: ${dockerfilePath}`);
      this.logger.log(`Docker context path: ${dockerContextPath}`);

      // Detect submission file and language
      const { submissionFile, language } = await this.detectSubmission(dockerContextPath);

      return {
        isValid: true,
        dockerContextPath,
        dockerfilePath,
        submissionFilePath: submissionFile,
        detectedLanguage: language,
      };
    } catch (error) {
      this.logger.error(`ZIP validation failed for problem ${problemId}:`, error);
      return {
        isValid: false,
        error: `ZIP extraction failed: ${error.message}`,
        dockerContextPath: extractPath,
        dockerfilePath: '',
      };
    }
  }

  /**
   * Recursively searches for Dockerfile in extracted directory.
   * Prioritizes files in root, then searches subdirectories.
   *
   * @param rootPath - Root extraction path
   * @returns Absolute path to Dockerfile, or null if not found
   */
  private async findDockerfile(rootPath: string): Promise<string | null> {
    const findRecursive = async (dir: string): Promise<string | null> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      // Check current directory first
      for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase() === 'dockerfile') {
          return path.join(dir, entry.name);
        }
      }

      // Recursively search subdirectories
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const found = await findRecursive(path.join(dir, entry.name));
          if (found) return found;
        }
      }

      return null;
    };

    return findRecursive(rootPath);
  }

  /**
   * Detects submission source file and programming language.
   * Searches for common source file extensions (cpp, java, py, etc.).
   *
   * @param contextPath - Docker context directory
   * @returns Submission file path and detected language
   */
  private async detectSubmission(
    contextPath: string,
  ): Promise<{ submissionFile?: string; language?: string }> {
    const languageMap: Record<string, string> = {
      cpp: 'C++',
      cc: 'C++',
      cxx: 'C++',
      java: 'Java',
      py: 'Python',
      js: 'JavaScript',
      ts: 'TypeScript',
      go: 'Go',
      rs: 'Rust',
      c: 'C',
    };

    try {
      const entries = await fs.readdir(contextPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1).toLowerCase();
          if (languageMap[ext]) {
            return {
              submissionFile: path.join(contextPath, entry.name),
              language: languageMap[ext],
            };
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to detect submission language: ${error.message}`);
    }

    return {};
  }
}
