import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/shared/modules/global/prisma.service';
import { CreateTourneyDto, TourneyResponseDto } from '../dto';
import { BracketGeneratorService } from './bracket-generator.service';

/**
 * Service for managing tournament operations.
 * Ports logic from Java TourneyManagerResource (ai-arena-backend-api).
 */
@Injectable()
export class TourneyService {
  private readonly logger = new Logger(TourneyService.name);

  constructor(
    private prisma: PrismaService,
    private bracketGenerator: BracketGeneratorService,
  ) {}

  async createTournament(createDto: CreateTourneyDto, userId: string): Promise<TourneyResponseDto> {
    this.logger.log(`Creating tournament: ${createDto.name}`);

    const bracketStructure = this.bracketGenerator.generateBracket(createDto);

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
          include: { contests: true },
          orderBy: { roundNumber: 'asc' },
        },
      },
    });

    this.logger.log(`Created tournament ${tournament.id} with ${tournament.rounds.length} rounds`);
    return this.mapToResponseDto(tournament);
  }

  async listTournaments(): Promise<TourneyResponseDto[]> {
    const tournaments = await this.prisma.tournament.findMany({
      include: {
        rounds: {
          include: { contests: true },
          orderBy: { roundNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return tournaments.map((t) => this.mapToResponseDto(t));
  }

  async getTournamentById(tournamentId: string): Promise<TourneyResponseDto> {
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
    return this.mapToResponseDto(tournament);
  }

  async assignProblem(
    tourneyId: string,
    roundNumber: number,
    contestId: string,
    problemId: string,
  ): Promise<TourneyResponseDto> {
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

    const round = tournament.rounds.find((r) => r.roundNumber === roundNumber);
    if (!round) {
      throw new BadRequestException(`Round ${roundNumber} not found in tournament ${tourneyId}`);
    }

    const contest = round.contests.find((c) => c.id === contestId);
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

    return this.getTournamentById(tourneyId);
  }

  async deleteTournament(tournamentId: string): Promise<void> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament ${tournamentId} not found`);
    }
    await this.prisma.tournament.delete({ where: { id: tournamentId } });
    this.logger.log(`Deleted tournament ${tournamentId}`);
  }

  private mapToResponseDto(tournament: any): TourneyResponseDto {
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
}
