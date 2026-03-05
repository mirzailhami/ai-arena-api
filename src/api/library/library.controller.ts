import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '@/shared/modules/auth';
import { JwtPayloadDto } from '@/shared/modules/auth/dto/jwt-payload.dto';
import { ProblemResponseDto, TestResultDto } from './dto';
import { LibraryService } from './services';

/**
 * Controller for Problem Library management.
 * Handles problem upload, Docker testing, and CRUD operations.
 *
 * Based on Java ProblemManagerResource endpoints (ai-arena-backend-api).
 *
 * All endpoints require JWT authentication (verified via global JwtAuthGuard).
 * TODO: Add role-based guards to restrict certain operations to admin/copilot roles.
 */
@ApiTags('library')
@ApiBearerAuth()
@Controller('library/problems')
export class LibraryController {
  private readonly logger = new Logger(LibraryController.name);

  constructor(private libraryService: LibraryService) {}

  /**
   * POST /library/problems
   * Uploads a new problem ZIP file to the library.
   *
   * TODO: Restrict to admin/copilot role (add role guard)
   */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a new problem ZIP file' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'Problem uploaded successfully',
    type: ProblemResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file or missing file' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async uploadProblem(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<ProblemResponseDto> {
    if (!file) {
      throw new Error('No file uploaded');
    }

    this.logger.log(`User ${user.handle} (${user.sub}) uploading problem: ${file.originalname}`);

    const problem = await this.libraryService.uploadProblem(
      file.buffer,
      file.originalname,
      user.sub,
    );

    return problem as ProblemResponseDto;
  }

  /**
   * POST /library/:id/test
   * Initiates Docker build and test cycle for a problem.
   *
   * TODO: Restrict to admin/copilot role (add role guard)
   */
  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test a problem using Docker build/run cycle' })
  @ApiParam({ name: 'id', description: 'Problem ID (UUID)', type: String })
  @ApiResponse({ status: 200, description: 'Test completed', type: TestResultDto })
  @ApiResponse({ status: 404, description: 'Problem not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async testProblem(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<TestResultDto> {
    this.logger.log(`User ${user.handle} (${user.sub}) testing problem ${id}`);

    const result = await this.libraryService.testProblem(id);
    return result as TestResultDto;
  }

  /**
   * GET /library/:id/log
   * Retrieves build/test logs for a problem.
   */
  @Get(':id/log')
  @ApiOperation({ summary: 'Get build and test logs for a problem' })
  @ApiParam({ name: 'id', description: 'Problem ID (UUID)', type: String })
  @ApiResponse({ status: 200, description: 'Log content', type: String })
  @ApiResponse({ status: 404, description: 'Problem not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProblemLog(@Param('id') id: string): Promise<{ log: string }> {
    const log = await this.libraryService.getProblemLog(id);
    return { log };
  }

  /**
   * GET /library
   * Lists all problems in the library.
   */
  @Get()
  @ApiOperation({ summary: 'List all problems in the library' })
  @ApiResponse({ status: 200, description: 'List of problems', type: [ProblemResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAllProblems(): Promise<ProblemResponseDto[]> {
    const problems = await this.libraryService.getAllProblems();
    return problems as ProblemResponseDto[];
  }

  /**
   * GET /library/:id
   * Retrieves a single problem by ID.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single problem by ID' })
  @ApiParam({ name: 'id', description: 'Problem ID (UUID)', type: String })
  @ApiResponse({ status: 200, description: 'Problem details', type: ProblemResponseDto })
  @ApiResponse({ status: 404, description: 'Problem not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProblemById(@Param('id') id: string): Promise<ProblemResponseDto> {
    const problem = await this.libraryService.getProblemById(id);
    return problem as ProblemResponseDto;
  }

  /**
   * DELETE /library/:id
   * Deletes a problem from the library.
   *
   * TODO: Restrict to admin/copilot role (add role guard)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a problem from the library' })
  @ApiParam({ name: 'id', description: 'Problem ID (UUID)', type: String })
  @ApiResponse({ status: 204, description: 'Problem deleted successfully' })
  @ApiResponse({ status: 404, description: 'Problem not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteProblem(@Param('id') id: string, @CurrentUser() user: JwtPayloadDto): Promise<void> {
    this.logger.log(`User ${user.handle} (${user.sub}) deleting problem ${id}`);
    await this.libraryService.deleteProblem(id);
  }

  /**
   * POST /library/:id/flag
   * Flags a problem for re-testing (resets status to Pending Test).
   *
   * TODO: Restrict to admin/copilot role (add role guard)
   */
  @Post(':id/flag')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Flag a problem for re-testing' })
  @ApiParam({ name: 'id', description: 'Problem ID (UUID)', type: String })
  @ApiResponse({ status: 200, description: 'Problem flagged for retest', type: ProblemResponseDto })
  @ApiResponse({ status: 404, description: 'Problem not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async flagForRetest(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<ProblemResponseDto> {
    this.logger.log(`User ${user.handle} (${user.sub}) flagging problem ${id} for retest`);

    const problem = await this.libraryService.flagForRetest(id);
    return problem as ProblemResponseDto;
  }
}
