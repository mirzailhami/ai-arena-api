import {
  Controller,
  Post,
  Get,
  Delete,
  Put,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  ParseIntPipe,
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
 * Controller for Tournament management.
 * Handles tournament creation, bracket generation, and CRUD operations.
 *
 * Based on Java TourneyManagerResource endpoints (ai-arena-backend-api).
 *
 * All endpoints require JWT authentication (verified via global JwtAuthGuard).
 * TODO: Add role-based guards to restrict certain operations to admin/copilot roles.
 */
@ApiTags('tourneys')
@ApiBearerAuth()
@Controller('tourneys')
export class TourneyController {
  private readonly logger = new Logger(TourneyController.name);

  constructor(private tourneyService: TourneyService) {}

  /**
   * POST /tourney
   * Creates a new tournament with auto-generated bracket structure.
   *
   * TODO: Restrict to admin/copilot role (add role guard)
   */
  @Post()
  @ApiOperation({ summary: 'Create a new tournament with bracket generation' })
  @ApiBody({ type: CreateTourneyDto })
  @ApiResponse({
    status: 201,
    description: 'Tournament created successfully',
    type: TourneyResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid tournament configuration' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createTournament(
    @Body() createDto: CreateTourneyDto,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<ResponseObject<TourneyResponseDto>> {
    this.logger.log(`User ${user.handle} (${user.sub}) creating tournament: ${createDto.name}`);
    const result = await this.tourneyService.createTournament(createDto, user.sub);
    return okResponse(result, 'Tournament created successfully');
  }

  /**
   * GET /tourney
   * Lists all tournaments.
   */
  @Get()
  @ApiOperation({ summary: 'List all tournaments' })
  @ApiResponse({
    status: 200,
    description: 'List of tournaments',
    type: [TourneyResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAllTournaments(): Promise<ResponseObject<TourneyResponseDto[]>> {
    const result = await this.tourneyService.getAllTournaments();
    return okResponse(result);
  }

  /**
   * GET /tourney/:id
   * Retrieves a single tournament with full bracket structure.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single tournament by ID with full bracket' })
  @ApiParam({ name: 'id', description: 'Tournament ID (UUID)', type: String })
  @ApiResponse({
    status: 200,
    description: 'Tournament details with full bracket',
    type: TourneyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Tournament not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTournamentById(@Param('id') id: string): Promise<ResponseObject<TourneyResponseDto>> {
    const result = await this.tourneyService.getTournamentById(id);
    return okResponse(result);
  }

  /**
   * PUT /tourneys/:id/rounds/:roundNumber/contests/:contestId/problems/:problemId
   * Assigns a problem to a specific contest in a tournament.
   *
   * TODO: Restrict to admin/copilot role (add role guard)
   */
  @Put(':id/rounds/:roundNumber/contests/:contestId/problems/:problemId')
  @ApiOperation({ summary: 'Assign a problem to a contest in a tournament' })
  @ApiParam({ name: 'id', description: 'Tournament ID (UUID)', type: String })
  @ApiParam({ name: 'roundNumber', description: 'Round number (1-based integer)', type: Number })
  @ApiParam({ name: 'contestId', description: 'Contest ID (UUID)', type: String })
  @ApiParam({ name: 'problemId', description: 'Problem ID (UUID)', type: String })
  @ApiResponse({
    status: 200,
    description: 'Problem assigned successfully',
    type: TourneyResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid round number or contest ID' })
  @ApiResponse({ status: 404, description: 'Tournament, contest, or problem not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async assignProblem(
    @Param('id') id: string,
    @Param('roundNumber', ParseIntPipe) roundNumber: number,
    @Param('contestId') contestId: string,
    @Param('problemId') problemId: string,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<ResponseObject<TourneyResponseDto>> {
    this.logger.log(
      `User ${user.handle} (${user.sub}) assigning problem ${problemId} to tournament ${id} round ${roundNumber} contest ${contestId}`,
    );

    const result = await this.tourneyService.assignProblem(id, roundNumber, contestId, problemId);
    return okResponse(result, 'Problem assigned successfully');
  }

  /**
   * DELETE /tourney/:id
   * Deletes a tournament and all associated rounds/contests.
   *
   * TODO: Restrict to admin/copilot role (add role guard)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tournament' })
  @ApiParam({ name: 'id', description: 'Tournament ID (UUID)', type: String })
  @ApiResponse({ status: 204, description: 'Tournament deleted successfully' })
  @ApiResponse({ status: 404, description: 'Tournament not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteTournament(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<void> {
    this.logger.log(`User ${user.handle} (${user.sub}) deleting tournament ${id}`);
    await this.tourneyService.deleteTournament(id);
  }
}
