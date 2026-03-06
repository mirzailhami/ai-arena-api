import {
  Controller,
  Post,
  Put,
  Get,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { CurrentUser } from '@/shared/modules/auth';
import { JwtPayloadDto } from '@/shared/modules/auth/dto/jwt-payload.dto';
import { CreateTourneyDto, TourneyRefResponseDto } from './dto';
import { TourneyService } from './services';
import { ResponseObject, okResponse } from '@/shared/dto/response-object';

/**
 * Reference-compatible Tournament controller.
 *
 * Routes match the Java TourneyManagerResource exactly
 * (after nginx strips the /arena-manager/api prefix):
 *
 *   POST   /tourney/create
 *   GET    /tourney/list
 *   GET    /tourney/:tourneyId
 *   DELETE /tourney/:tourneyId
 *   PUT    /tourney/:tourneyId/round/:roundNumber/contest/:contestId/problem/:problemId
 *
 * All endpoints require JWT authentication (enforced by global JwtAuthGuard).
 * TODO: Restrict create/delete/update to admin/copilot role (add role guard).
 */
@ApiTags('tourney')
@ApiBearerAuth()
@Controller('tourney')
export class TourneyRefController {
  private readonly logger = new Logger(TourneyRefController.name);

  constructor(private readonly tourneyService: TourneyService) {}

  /**
   * POST /tourney/create
   * Creates a new tournament with auto-generated bracket structure.
   * Mirrors TourneyManagerResource.createTournament().
   */
  @Post('create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a new tournament (Java-spec compatible)' })
  @ApiBody({ type: CreateTourneyDto })
  @ApiResponse({ status: 200, description: 'Tournament created successfully' })
  async createTournament(
    @Body() createDto: CreateTourneyDto,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<ResponseObject<TourneyRefResponseDto>> {
    const result = await this.tourneyService.createTournamentRef(createDto, user.sub);
    this.logger.log(`Created tournament: ${result.tourneyId}`);
    return okResponse(result, `Tournament created successfully. ID: ${result.tourneyId}`);
  }

  /**
   * GET /tourney/list
   * Returns all tournaments.
   * Mirrors TourneyManagerResource.listTournaments().
   * NOTE: Registered before GET /tourney/:tourneyId to avoid route conflict.
   */
  @Get('list')
  @ApiOperation({ summary: 'List all tournaments (Java-spec compatible)' })
  @ApiResponse({ status: 200, description: 'List of all tournaments' })
  async listTournaments(): Promise<ResponseObject<TourneyRefResponseDto[]>> {
    const result = await this.tourneyService.listTournamentsRef();
    return okResponse(result, `Retrieved ${result.length} tournaments.`);
  }

  /**
   * GET /tourney/:tourneyId
   * Returns a single tournament by ID.
   * Mirrors TourneyManagerResource.getTournament().
   */
  @Get(':tourneyId')
  @ApiOperation({ summary: 'Get tournament by ID (Java-spec compatible)' })
  @ApiParam({ name: 'tourneyId', description: 'Tournament UUID' })
  @ApiResponse({ status: 200, description: 'Tournament retrieved' })
  @ApiResponse({ status: 404, description: 'Tournament not found' })
  async getTournament(
    @Param('tourneyId') tourneyId: string,
  ): Promise<ResponseObject<TourneyRefResponseDto>> {
    const result = await this.tourneyService.getTournamentByIdRef(tourneyId);
    return okResponse(result, 'Tournament metadata retrieved successfully.');
  }

  /**
   * DELETE /tourney/:tourneyId
   * Deletes a tournament and all its rounds/contests.
   * Mirrors TourneyManagerResource.deleteTournament().
   */
  @Delete(':tourneyId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a tournament (Java-spec compatible)' })
  @ApiParam({ name: 'tourneyId', description: 'Tournament UUID' })
  @ApiResponse({ status: 200, description: 'Tournament deleted' })
  @ApiResponse({ status: 404, description: 'Tournament not found' })
  async deleteTournament(
    @Param('tourneyId') tourneyId: string,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<ResponseObject<string>> {
    await this.tourneyService.deleteTournament(tourneyId);
    this.logger.log(`User ${user.handle} deleted tournament: ${tourneyId}`);
    return okResponse(`Deleted ${tourneyId}`, 'Tournament deleted successfully.');
  }

  /**
   * PUT /tourney/:tourneyId/round/:roundNumber/contest/:contestId/problem/:problemId
   * Assigns a problem to a specific contest in a round.
   * Mirrors TourneyManagerResource.updateContestProblem() exactly.
   */
  @Put(':tourneyId/round/:roundNumber/contest/:contestId/problem/:problemId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign problem to a contest (Java-spec compatible)' })
  @ApiParam({ name: 'tourneyId', description: 'Tournament UUID' })
  @ApiParam({ name: 'roundNumber', description: 'Round number (1-based)', type: Number })
  @ApiParam({ name: 'contestId', description: 'Contest UUID' })
  @ApiParam({ name: 'problemId', description: 'Problem UUID' })
  @ApiResponse({ status: 200, description: 'Problem assigned successfully' })
  @ApiResponse({ status: 404, description: 'Tournament, round, contest, or problem not found' })
  async assignContestProblem(
    @Param('tourneyId') tourneyId: string,
    @Param('roundNumber', ParseIntPipe) roundNumber: number,
    @Param('contestId') contestId: string,
    @Param('problemId') problemId: string,
  ): Promise<ResponseObject<TourneyRefResponseDto>> {
    const result = await this.tourneyService.assignContestProblemRef(
      tourneyId,
      roundNumber,
      contestId,
      problemId,
    );
    this.logger.log(
      `Assigned problem ${problemId} to contest ${contestId} in tourney ${tourneyId} round ${roundNumber}`,
    );
    return okResponse(
      result,
      `Problem ${problemId} assigned to Contest ${contestId} successfully.`,
    );
  }
}
