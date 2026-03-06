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
import { CreateTourneyDto, TourneyResponseDto } from './dto';
import { TourneyService } from './services';
import { ResponseObject, okResponse } from '@/shared/dto/response-object';

/**
 * Tournament controller — routes match Java TourneyManagerResource exactly
 * (after nginx strips the /arena-manager/api prefix):
 *
 *   POST   /tourney/create
 *   GET    /tourney/list
 *   GET    /tourney/:tourneyId
 *   DELETE /tourney/:tourneyId
 *   PUT    /tourney/:tourneyId/round/:roundNumber/contest/:contestId/problem/:problemId
 *
 * All endpoints require JWT authentication (enforced by global JwtAuthGuard).
 */
@ApiTags('tourney')
@ApiBearerAuth()
@Controller('tourney')
export class TourneyController {
  private readonly logger = new Logger(TourneyController.name);

  constructor(private readonly tourneyService: TourneyService) {}

  /**
   * POST /tourney/create
   * Creates a new tournament with auto-generated bracket structure.
   */
  @Post('create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a new tournament' })
  @ApiBody({ type: CreateTourneyDto })
  @ApiResponse({ status: 200, description: 'Tournament created successfully', type: TourneyResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid tournament configuration' })
  async createTournament(
    @Body() createDto: CreateTourneyDto,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<ResponseObject<TourneyResponseDto>> {
    const result = await this.tourneyService.createTournament(createDto, user.sub);
    this.logger.log(`User ${user.handle} created tournament: ${result.tourneyId}`);
    return okResponse(result, `Tournament created successfully. ID: ${result.tourneyId}`);
  }

  /**
   * GET /tourney/list
   * Returns all tournaments.
   * NOTE: Registered before GET /tourney/:tourneyId to avoid route conflict.
   */
  @Get('list')
  @ApiOperation({ summary: 'List all tournaments' })
  @ApiResponse({ status: 200, description: 'List of all tournaments', type: [TourneyResponseDto] })
  async listTournaments(): Promise<ResponseObject<TourneyResponseDto[]>> {
    const result = await this.tourneyService.listTournaments();
    return okResponse(result, `Retrieved ${result.length} tournaments.`);
  }

  /**
   * GET /tourney/:tourneyId
   * Returns a single tournament by ID.
   */
  @Get(':tourneyId')
  @ApiOperation({ summary: 'Get tournament by ID' })
  @ApiParam({ name: 'tourneyId', description: 'Tournament UUID' })
  @ApiResponse({ status: 200, description: 'Tournament retrieved', type: TourneyResponseDto })
  @ApiResponse({ status: 404, description: 'Tournament not found' })
  async getTournamentById(
    @Param('tourneyId') tourneyId: string,
  ): Promise<ResponseObject<TourneyResponseDto>> {
    const result = await this.tourneyService.getTournamentById(tourneyId);
    return okResponse(result, 'Tournament retrieved successfully.');
  }

  /**
   * DELETE /tourney/:tourneyId
   * Deletes a tournament and all its rounds/contests.
   * Returns 200 + string message, matching Java ResponseObject<String>.
   */
  @Delete(':tourneyId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a tournament' })
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
  @ApiOperation({ summary: 'Assign a problem to a contest' })
  @ApiParam({ name: 'tourneyId', description: 'Tournament UUID' })
  @ApiParam({ name: 'roundNumber', description: 'Round number (1-based)', type: Number })
  @ApiParam({ name: 'contestId', description: 'Contest UUID' })
  @ApiParam({ name: 'problemId', description: 'Problem UUID' })
  @ApiResponse({ status: 200, description: 'Problem assigned successfully', type: TourneyResponseDto })
  @ApiResponse({ status: 404, description: 'Tournament, round, contest, or problem not found' })
  async assignProblem(
    @Param('tourneyId') tourneyId: string,
    @Param('roundNumber', ParseIntPipe) roundNumber: number,
    @Param('contestId') contestId: string,
    @Param('problemId') problemId: string,
  ): Promise<ResponseObject<TourneyResponseDto>> {
    const result = await this.tourneyService.assignProblem(tourneyId, roundNumber, contestId, problemId);
    this.logger.log(`Assigned problem ${problemId} to contest ${contestId} in tourney ${tourneyId} round ${roundNumber}`);
    return okResponse(result, `Problem ${problemId} assigned to Contest ${contestId} successfully.`);
  }
}
