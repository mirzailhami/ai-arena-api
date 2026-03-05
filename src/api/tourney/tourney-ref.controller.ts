import {
  Controller,
  Post,
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
  ApiBody,
} from '@nestjs/swagger';
import { CurrentUser } from '@/shared/modules/auth';
import { JwtPayloadDto } from '@/shared/modules/auth/dto/jwt-payload.dto';
import { CreateTourneyDto, TourneyRefResponseDto, UpdateTourneyBracketDto } from './dto';
import { TourneyService } from './services';
import { ResponseObject, okResponse } from '@/shared/dto/response-object';

/**
 * Reference-compatible controller for Tournament management.
 * Matches the reference API contract:
 *   POST /tourney/create
 *   PUT  /tourney/:id
 *
 * All endpoints require JWT authentication (verified via global JwtAuthGuard).
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
   * Returns tournament data in reference response shape.
   */
  @Post('create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a new tournament (reference-compatible)' })
  @ApiBody({ type: CreateTourneyDto })
  @ApiResponse({ status: 200, description: 'Tournament created successfully' })
  async createTournament(
    @Body() createDto: CreateTourneyDto,
    @CurrentUser() user: JwtPayloadDto,
  ): Promise<ResponseObject<TourneyRefResponseDto>> {
    const result = await this.tourneyService.createTournamentRef(
      createDto,
      user.sub,
    );
    this.logger.log(`Created tournament (ref): ${result.tourneyId}`);
    return okResponse(
      result,
      `Tournament created successfully. ID: ${result.tourneyId}`,
    );
  }

  /**
   * PUT /tourney/:id
   * Updates a tournament's bracket structure (all contest problem assignments).
   * Accepts the full bracket object in the reference shape.
   */
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update tournament bracket (reference-compatible)' })
  @ApiBody({ type: UpdateTourneyBracketDto })
  @ApiResponse({ status: 200, description: 'Tournament updated successfully' })
  async updateBracket(
    @Param('id') id: string,
    @Body() dto: UpdateTourneyBracketDto,
  ): Promise<ResponseObject<TourneyRefResponseDto>> {
    const result = await this.tourneyService.updateTourneyBracket(id, dto);
    this.logger.log(`Updated bracket (ref): ${id}`);
    return okResponse(result, 'Tournament updated successfully.');
  }
}
