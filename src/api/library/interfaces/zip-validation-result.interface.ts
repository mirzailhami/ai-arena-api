/**
 * Result of ZIP file validation and analysis.
 * Contains paths to key files and directories within the extracted ZIP.
 */
export interface ZipValidationResult {
  /** Whether the ZIP is valid and ready for Docker build */
  isValid: boolean;

  /** Validation error message (if any) */
  error?: string;

  /** Path to the effective Docker context directory (where docker build will run) */
  dockerContextPath: string;

  /** Path to the Dockerfile (relative to extraction root, or absolute if not in context) */
  dockerfilePath: string;

  /** Path to the submission source file (if found) */
  submissionFilePath?: string;

  /** Detected programming language (based on file extensions) */
  detectedLanguage?: string;
}
