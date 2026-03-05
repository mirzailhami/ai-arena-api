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
import { AssignProblemDto, CreateTourneyDto, TourneyResponseDto } from './dto';
import { TourneyService } from './services';

/**
 * Controller for Tournament management.
 * Handles tournament creation, bracket generation, and CRUD operations.
 *
 * Based on Java TourneyManagerResource endpoints (ai-arena-backend-api).
 *
 * All endpoints require JWT authentication (verified via global JwtAuthGuard).
 * TODO: Add role-based guards to restrict certain operations to admin/copilot roles.
 */
@ApiTags('tourney')
@ApiBearerAuth()
@Controller('tourney')
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
  ): Promise<TourneyResponseDto> {
    this.logger.log(
      `User ${user.handle} (${user.sub}) creating tournament: ${createDto.name}`,
    );

    return this.tourneyService.createTournament(createDto, user.sub);
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
  async getAllTournaments(): Promise<TourneyResponseDto[]> {
    return this.tourneyService.getAllTournaments();
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
  async getTournamentById(@Param('id') id: string): Promise<TourneyResponseDto> {
    return this.tourneyService.getTournamentById(id);
  }

  /**
   * PUT /tourney/:id/problem
   * Assigns a problem to a specific contest in a tournament.
   *
   * TODO: Restrict to admin/copilot role (add role guard)
   */
  @Put(':id/problem')
  @ApiOperation({ summary: 'Assign a problem to a contest in a tournament' })
  @ApiParam({ name: 'id', description: 'Tournament ID (UUID)', type: String })
  @ApiBody({ type: AssignProblemDto })
  @ApiResponse({
    status: 200,
    description: 'Problem assigned successfully',
    type: TourneyResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid round/contest index or problem ID' })
  @ApiResponse({ status: 404, description: 'Tournament or problem not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async assignProblem(
    @Param('id') id: string,
    @Body() assignDto: AssignProblemDto,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<TourneyResponseDto> {
    this.logger.log(
      `User ${user.handle} (${user.sub}) assigning problem ${assignDto.problemId} to tournament ${id}`,
    );

    return this.tourneyService.assignProblem(id, assignDto);
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
