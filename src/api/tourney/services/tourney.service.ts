import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Tournament } from '@prisma/client';
import { PrismaService } from '@/shared/modules/global/prisma.service';
import { AssignProblemDto, CreateTourneyDto, TourneyResponseDto } from '../dto';
import { BracketGeneratorService } from './bracket-generator.service';

/**
 * Service for managing tournament operations.
 * Ports logic from Java TourneyManagerResource (ai-arena-backend-api).
 *
 * Key workflows:
 * - Create tournament → generate bracket → save to database
 * - List/retrieve tournaments with full bracket structure
 * - Assign problems to specific contests
 * - Delete tournaments
 */
@Injectable()
export class TourneyService {
  private readonly logger = new Logger(TourneyService.name);

  constructor(
    private prisma: PrismaService,
    private bracketGenerator: BracketGeneratorService,
  ) {}

  /**
   * Creates a new tournament with generated bracket structure.
   *
   * @param createDto - Tournament configuration
   * @param userId - User creating the tournament
   * @returns Created tournament with full bracket
   */
  async createTournament(
    createDto: CreateTourneyDto,
    userId: string,
  ): Promise<TourneyResponseDto> {
    this.logger.log(`Creating tournament: ${createDto.name}`);

    // 1. Generate bracket structure (rounds + contests)
    const bracketStructure = this.bracketGenerator.generateBracket(createDto);

    // 2. Create tournament with nested rounds and contests
    const tournament = await this.prisma.tournament.create({
      data: {
        name: createDto.name,
        numRounds: createDto.numRounds,
        initialEntrants: createDto.initialEntrants,
        maxContestantsPerMatch: createDto.maxContestantsPerMatch,
        advancingContestants: createDto.advancingContestants,
        isActive: true,
        createdBy: userId,
        rounds: {
          create: bracketStructure.map((round) => ({
            roundNumber: round.roundNumber,
            roundName: round.roundName,
            contests: {
              create: round.contests.map((contest) => ({
                entrantIds: contest.entrantIds,
              })),
            },
          })),
        },
      },
      include: {
        rounds: {
          include: {
            contests: true,
          },
          orderBy: {
            roundNumber: 'asc',
          },
        },
      },
    });

    this.logger.log(`Created tournament ${tournament.id} with ${tournament.rounds.length} rounds`);

    return this.mapToResponseDto(tournament);
  }

  /**
   * Retrieves all tournaments.
   *
   * @returns List of tournaments with basic metadata (no full bracket)
   */
  async getAllTournaments(): Promise<TourneyResponseDto[]> {
    const tournaments = await this.prisma.tournament.findMany({
      include: {
        rounds: {
          include: {
            contests: true,
          },
          orderBy: {
            roundNumber: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return tournaments.map((t) => this.mapToResponseDto(t));
  }

  /**
   * Retrieves a single tournament by ID with full bracket structure.
   *
   * @param tournamentId - Tournament ID
   * @returns Tournament with full rounds and contests
   */
  async getTournamentById(tournamentId: string): Promise<TourneyResponseDto> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        rounds: {
          include: {
            contests: true,
          },
          orderBy: {
            roundNumber: 'asc',
          },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament ${tournamentId} not found`);
    }

    return this.mapToResponseDto(tournament);
  }

  /**
   * Assigns a problem to a specific contest in a tournament.
   *
   * @param tournamentId - Tournament ID
   * @param assignDto - Round number, contest index, and problem ID
   * @returns Updated tournament
   */
  async assignProblem(
    tournamentId: string,
    assignDto: AssignProblemDto,
  ): Promise<TourneyResponseDto> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        rounds: {
          include: {
            contests: true,
          },
          orderBy: {
            roundNumber: 'asc',
          },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament ${tournamentId} not found`);
    }

    // Find the target round
    const round = tournament.rounds.find((r) => r.roundNumber === assignDto.roundNumber);
    if (!round) {
      throw new BadRequestException(
        `Round ${assignDto.roundNumber} not found in tournament ${tournamentId}`,
      );
    }

    // Find the target contest
    const contest = round.contests[assignDto.contestIndex];
    if (!contest) {
      throw new BadRequestException(
        `Contest index ${assignDto.contestIndex} not found in round ${assignDto.roundNumber}`,
      );
    }

    // Verify problem exists
    const problem = await this.prisma.problem.findUnique({
      where: { id: assignDto.problemId },
    });
    if (!problem) {
      throw new NotFoundException(`Problem ${assignDto.problemId} not found`);
    }

    // Update contest with problem ID
    await this.prisma.contest.update({
      where: { id: contest.id },
      data: { problemId: assignDto.problemId },
    });

    this.logger.log(
      `Assigned problem ${assignDto.problemId} to tournament ${tournamentId} round ${assignDto.roundNumber} contest ${assignDto.contestIndex}`,
    );

    // Return updated tournament
    return this.getTournamentById(tournamentId);
  }

  /**
   * Deletes a tournament and all associated rounds/contests.
   *
   * @param tournamentId - Tournament ID to delete
   */
  async deleteTournament(tournamentId: string): Promise<void> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament ${tournamentId} not found`);
    }

    // Cascade delete will remove all rounds and contests
    await this.prisma.tournament.delete({
      where: { id: tournamentId },
    });

    this.logger.log(`Deleted tournament ${tournamentId}`);
  }

  /**
   * Maps Prisma Tournament model to response DTO.
   */
  private mapToResponseDto(tournament: any): TourneyResponseDto {
    return {
      id: tournament.id,
      name: tournament.name,
      numRounds: tournament.numRounds,
      initialEntrants: tournament.initialEntrants,
      maxContestantsPerMatch: tournament.maxContestantsPerMatch,
      advancingContestants: tournament.advancingContestants,
      startDate: tournament.startDate,
      isActive: tournament.isActive,
      createdAt: tournament.createdAt,
      createdBy: tournament.createdBy || undefined,
      rounds: tournament.rounds.map((round: any) => ({
        id: round.id,
        roundNumber: round.roundNumber,
        roundName: round.roundName,
        contests: round.contests.map((contest: any) => ({
          id: contest.id,
          problemId: contest.problemId || undefined,
          entrantIds: contest.entrantIds,
          winnerId: contest.winnerId || undefined,
        })),
      })),
    };
  }
}
