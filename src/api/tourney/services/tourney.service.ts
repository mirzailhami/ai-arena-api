import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Tournament } from '@prisma/client';
import { PrismaService } from '@/shared/modules/global/prisma.service';
import { CreateTourneyDto, TourneyResponseDto, TourneyRefResponseDto, UpdateTourneyBracketDto } from '../dto';
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
  async createTournament(createDto: CreateTourneyDto, userId: string): Promise<TourneyResponseDto> {
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
    roundNumber: number,
    contestId: string,
    problemId: string,
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

    // Validate the round exists
    const round = tournament.rounds.find((r) => r.roundNumber === roundNumber);
    if (!round) {
      throw new BadRequestException(`Round ${roundNumber} not found in tournament ${tournamentId}`);
    }

    // Find the target contest by UUID within that round
    const contest = round.contests.find((c) => c.id === contestId);
    if (!contest) {
      throw new NotFoundException(`Contest ${contestId} not found in round ${roundNumber}`);
    }

    // Verify problem exists
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
    });
    if (!problem) {
      throw new NotFoundException(`Problem ${problemId} not found`);
    }

    // Update contest with problem ID
    await this.prisma.contest.update({
      where: { id: contest.id },
      data: { problemId },
    });

    this.logger.log(
      `Assigned problem ${problemId} to tournament ${tournamentId} round ${roundNumber} contest ${contestId}`,
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

  /**
   * Maps Prisma Tournament model to the reference-compatible response DTO.
   * Uses tourneyId, bracketStructure.rounds, contestId, and Unix ms startDate.
   */
  private mapToRefResponseDto(tournament: any): TourneyRefResponseDto {
    return {
      tourneyId: tournament.id,
      name: tournament.name,
      numRounds: tournament.numRounds,
      initialEntrants: tournament.initialEntrants,
      maxContestantsPerMatch: tournament.maxContestantsPerMatch,
      advancingContestants: tournament.advancingContestants,
      startDate: tournament.startDate
        ? new Date(tournament.startDate).getTime()
        : Date.now(),
      isActive: tournament.isActive,
      bracketStructure: {
        rounds: tournament.rounds.map((round: any) => ({
          roundNumber: round.roundNumber,
          roundName: round.roundName,
          contests: round.contests.map((contest: any) => ({
            contestId: contest.id,
            problemId: contest.problemId ?? null,
            entrantIds: contest.entrantIds?.length ? contest.entrantIds : null,
            winnerId: contest.winnerId ?? null,
          })),
        })),
      },
    };
  }

  /**
   * Creates a new tournament (reference-compatible).
   * Same logic as createTournament but returns TourneyRefResponseDto.
   */
  async createTournamentRef(createDto: CreateTourneyDto, userId: string): Promise<TourneyRefResponseDto> {
    const result = await this.createTournament(createDto, userId);
    // Re-fetch with full include to ensure we have all data
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: result.id },
      include: {
        rounds: {
          include: { contests: true },
          orderBy: { roundNumber: 'asc' },
        },
      },
    });
    return this.mapToRefResponseDto(tournament);
  }

  /**
   * Lists all tournaments in the reference-compatible shape.
   * GET /tourney/list
   */
  async listTournamentsRef(): Promise<TourneyRefResponseDto[]> {
    const tournaments = await this.prisma.tournament.findMany({
      include: {
        rounds: {
          include: { contests: true },
          orderBy: { roundNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return tournaments.map(t => this.mapToRefResponseDto(t));
  }

  /**
   * Retrieves a single tournament by ID in the reference-compatible shape.
   * GET /tourney/:id
   */
  async getTournamentByIdRef(tournamentId: string): Promise<TourneyRefResponseDto> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        rounds: {
          include: { contests: true },
          orderBy: { roundNumber: 'asc' },
        },
      },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament ${tournamentId} not found`);
    }
    return this.mapToRefResponseDto(tournament);
  }

  /**
   * Assigns a problem to a specific contest in a round (reference-compatible).
   * PUT /tourney/:tourneyId/round/:roundNumber/contest/:contestId/problem/:problemId
   * Mirrors the Java TourneyManagerResource.updateContestProblem() logic exactly.
   */
  async assignContestProblemRef(
    tourneyId: string,
    roundNumber: number,
    contestId: string,
    problemId: string,
  ): Promise<TourneyRefResponseDto> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tourneyId },
      include: {
        rounds: {
          include: { contests: true },
          orderBy: { roundNumber: 'asc' },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament ${tourneyId} not found`);
    }

    const round = tournament.rounds.find(r => r.roundNumber === roundNumber);
    if (!round) {
      throw new NotFoundException(`Round ${roundNumber} not found in tournament ${tourneyId}`);
    }

    const contest = round.contests.find(c => c.id === contestId);
    if (!contest) {
      throw new NotFoundException(`Contest ${contestId} not found in round ${roundNumber}`);
    }

    const problem = await this.prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      throw new NotFoundException(`Problem ${problemId} not found`);
    }

    await this.prisma.contest.update({
      where: { id: contestId },
      data: { problemId },
    });

    this.logger.log(
      `Assigned problem ${problemId} to contest ${contestId} in tournament ${tourneyId} round ${roundNumber}`,
    );

    const updated = await this.prisma.tournament.findUnique({
      where: { id: tourneyId },
      include: {
        rounds: {
          include: { contests: true },
          orderBy: { roundNumber: 'asc' },
        },
      },
    });

    return this.mapToRefResponseDto(updated);
  }

  /**
   * Updates a tournament's bracket structure (reference-compatible PUT).
   * Iterates all contests in the payload and updates their problemId.
   */
  async updateTourneyBracket(
    tournamentId: string,
    dto: UpdateTourneyBracketDto,
  ): Promise<TourneyRefResponseDto> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        rounds: {
          include: { contests: true },
          orderBy: { roundNumber: 'asc' },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament ${tournamentId} not found`);
    }

    // Collect all contest updates from the payload
    const contestUpdates: Array<{ id: string; problemId: string | null }> = [];

    for (const payloadRound of dto.bracketStructure.rounds) {
      for (const payloadContest of payloadRound.contests) {
        contestUpdates.push({
          id: payloadContest.contestId,
          problemId: payloadContest.problemId ?? null,
        });
      }
    }

    // Apply updates in parallel
    await Promise.all(
      contestUpdates.map(({ id, problemId }) =>
        this.prisma.contest.update({
          where: { id },
          data: { problemId: problemId ?? null },
        }),
      ),
    );

    this.logger.log(
      `Updated bracket for tournament ${tournamentId}: ${contestUpdates.length} contests`,
    );

    // Return updated tournament in reference shape
    const updated = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        rounds: {
          include: { contests: true },
          orderBy: { roundNumber: 'asc' },
        },
      },
    });

    return this.mapToRefResponseDto(updated);
  }
}
