import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '@/shared/modules/auth';
import { JwtPayloadDto } from '@/shared/modules/auth/dto/jwt-payload.dto';
import { ResponseObject, okResponse, failResponse } from '@/shared/dto/response-object';
import { SourceProblemDto, toSourceProblem } from './dto';
import { LibraryService } from './services';

/**
 * Controller for Problem Library management.
 *
 * Routes match the platform-ui arena-manager service contract:
 *   GET    /problem/list
 *   POST   /problem/upload        (binary octet-stream, X-Problem-Name header)
 *   POST   /problem/test/:id
 *   GET    /problem/:id
 *   DELETE /problem/:id
 *   GET    /problem/:id/log
 *   POST   /problem/flag/:id      (body: true | false)
 *
 * Auth: accepts JWT in either Authorization: Bearer OR sessionId header.
 * Response shape: { success, data, message } to match ResponseObject<T>.
 */
@ApiTags('library')
@ApiBearerAuth()
@ApiHeader({
  name: 'sessionId',
  description: 'Platform v3 JWT (alternative to Authorization header)',
  required: false,
})
@Controller('problem')
export class LibraryController {
  private readonly logger = new Logger(LibraryController.name);

  constructor(private libraryService: LibraryService) {}

  /**
   * POST /problem/upload
   * Uploads a new problem ZIP as a binary octet-stream.
   * Name is taken from the X-Problem-Name header; filename from Content-Disposition.
   */
  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload a new problem ZIP file (binary stream)' })
  @ApiConsumes('application/octet-stream')
  @ApiHeader({ name: 'X-Problem-Name', description: 'Human-readable problem name', required: true })
  @ApiHeader({
    name: 'Content-Disposition',
    description: 'attachment; filename="problem.zip"',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Problem uploaded successfully' })
  @ApiResponse({ status: 400, description: 'No binary body received' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async uploadProblem(
    @Req() req: Request,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<ResponseObject<SourceProblemDto>> {
    const buffer = req.body as Buffer;
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return failResponse(
        'No binary body received. Send the ZIP file as application/octet-stream.',
      );
    }

    const problemName = (req.headers['x-problem-name'] as string)?.trim() || 'Unnamed Problem';

    const disposition = req.headers['content-disposition'] as string;
    const fileNameMatch = disposition?.match(/filename[^;=\n]*=['"]?([^'"\n]+)['"]?/i);
    const zipFileName = fileNameMatch?.[1] || `${problemName.replace(/\s+/g, '-')}.zip`;

    this.logger.log(
      `User ${user.handle} (${user.sub}) uploading problem: ${problemName} / ${zipFileName}`,
    );

    const problem = await this.libraryService.uploadProblem(
      buffer,
      problemName,
      zipFileName,
      user.sub,
    );

    return okResponse(toSourceProblem(problem), `Problem '${problemName}' uploaded successfully`);
  }

  /**
   * POST /problem/test/:id
   * Initiates Docker build and test cycle for a problem.
   * Returns success=true/false based on whether the Docker test passed.
   */
  @Post('test/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test a problem using Docker build/run cycle' })
  @ApiParam({ name: 'id', description: 'Problem ID (UUID)', type: String })
  @ApiResponse({ status: 200, description: 'Test completed (check success field for pass/fail)' })
  @ApiResponse({ status: 404, description: 'Problem not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async testProblem(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<ResponseObject<string>> {
    this.logger.log(`User ${user.handle} (${user.sub}) testing problem ${id}`);

    const result = await this.libraryService.testProblem(id);
    const log = `${result.buildLog}\n\n=== Runtime Output ===\n${result.runtimeLog}`.trim();

    if (result.testPassed) {
      return okResponse(log, 'Test passed.');
    }
    return failResponse(
      result.buildLog ? 'Test failed. See build log for details.' : 'Test failed.',
      log,
    );
  }

  /**
   * GET /problem/list
   * Lists all problems in the library.
   */
  @Get('list')
  @ApiOperation({ summary: 'List all problems in the library' })
  @ApiResponse({ status: 200, description: 'List of problems' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAllProblems(): Promise<ResponseObject<SourceProblemDto[]>> {
    const problems = await this.libraryService.getAllProblems();
    return okResponse(problems.map(toSourceProblem));
  }

  /**
   * GET /problem/:id
   * Retrieves a single problem by ID.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single problem by ID' })
  @ApiParam({ name: 'id', description: 'Problem ID (UUID)', type: String })
  @ApiResponse({ status: 200, description: 'Problem details' })
  @ApiResponse({ status: 404, description: 'Problem not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProblemById(@Param('id') id: string): Promise<ResponseObject<SourceProblemDto>> {
    const problem = await this.libraryService.getProblemById(id);
    return okResponse(toSourceProblem(problem));
  }

  /**
   * DELETE /problem/:id
   * Deletes a problem from the library.
   * Returns 200 with body (not 204) so the UI can parse the JSON response.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a problem from the library' })
  @ApiParam({ name: 'id', description: 'Problem ID (UUID)', type: String })
  @ApiResponse({ status: 200, description: 'Problem deleted successfully' })
  @ApiResponse({ status: 404, description: 'Problem not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteProblem(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<ResponseObject<null>> {
    this.logger.log(`User ${user.handle} (${user.sub}) deleting problem ${id}`);
    await this.libraryService.deleteProblem(id);
    return okResponse(null, 'Problem deleted successfully');
  }

  /**
   * GET /problem/:id/log
   * Retrieves build/test logs for a problem.
   */
  @Get(':id/log')
  @ApiOperation({ summary: 'Get build and test logs for a problem' })
  @ApiParam({ name: 'id', description: 'Problem ID (UUID)', type: String })
  @ApiResponse({ status: 200, description: 'Log content (string in data field)' })
  @ApiResponse({ status: 404, description: 'Problem not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProblemLog(@Param('id') id: string): Promise<ResponseObject<string>> {
    const log = await this.libraryService.getProblemLog(id);
    return okResponse(log);
  }

  /**
   * POST /problem/flag/:id
   * Sets or clears the isContestReady flag for a problem.
   * Body: true (flag as contest-ready) or false (unflag).
   */
  @Post('flag/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set or clear the contest-ready flag for a problem' })
  @ApiParam({ name: 'id', description: 'Problem ID (UUID)', type: String })
  @ApiBody({
    schema: { type: 'boolean' },
    description: 'true = flag as contest-ready, false = unflag',
  })
  @ApiResponse({ status: 200, description: 'Flag updated' })
  @ApiResponse({ status: 404, description: 'Problem not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async flagProblem(
    @Param('id') id: string,
    @Body() flag: unknown,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<ResponseObject<SourceProblemDto>> {
    const isReady = flag === true || flag === 'true';
    this.logger.log(
      `User ${user.handle} (${user.sub}) ${isReady ? 'flagging' : 'unflagging'} problem ${id}`,
    );
    const problem = await this.libraryService.setContestReady(id, isReady);
    return okResponse(
      toSourceProblem(problem),
      isReady ? 'Problem flagged as contest-ready.' : 'Contest-ready flag removed.',
    );
  }
}
