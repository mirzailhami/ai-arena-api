import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, Tournament } from '@prisma/client'
import { randomUUID } from 'crypto'

import { ResponseObject, responseOf } from '../common/api-response'
import { PrismaService } from '../prisma/prisma.service'
import { LoggerService } from '../shared/modules/global/logger.service'
import { CreateTournamentDto } from './dto/create-tournament.dto'
import { UpdateTournamentDto } from './dto/update-tournament.dto'
import { RoomDto, TournamentBracket, TournamentDto } from './tournament.types'

@Injectable()
export class TournamentsService {
  private readonly logger = LoggerService.forRoot('TournamentsService')

  constructor(private readonly prisma: PrismaService) {}

  async createTournament(
    payload: CreateTournamentDto,
  ): Promise<ResponseObject<TournamentDto>> {
    this.logger.log({ action: 'createTournament.start', payload })
    const bracketStructure = this.generateInitialBracket(payload)
    const created = await this.prisma.tournament.create({
      data: {
        advancingContestants: payload.advancingContestants,
        bracketJson: bracketStructure as unknown as Prisma.InputJsonValue,
        initialEntrants: payload.initialEntrants,
        maxContestantsPerMatch: payload.maxContestantsPerMatch,
        name: payload.name,
        numRounds: payload.numRounds,
      },
    })
    this.logger.log({
      action: 'createTournament.finish',
      tournamentId: created.id,
    })

    return responseOf(
      await this.toTournamentDto(created),
      true,
      `Tournament created successfully. ID: ${created.id}`,
    )
  }

  async updateTournament(
    tourneyId: string,
    payload: UpdateTournamentDto,
  ): Promise<ResponseObject<TournamentDto | null>> {
    this.logger.log({ action: 'updateTournament.start', tourneyId })
    const existing = await this.prisma.tournament.findUnique({
      where: { id: tourneyId },
    })
    if (!existing) {
      this.logger.warn({ action: 'updateTournament.notFound', tourneyId })
      return responseOf(
        null,
        false,
        `Error: Tournament ID ${tourneyId} not found.`,
      )
    }

    const enrichedBracket = await this.attachProblemNames(
      payload.bracketStructure as TournamentBracket,
    )
    const updated = await this.prisma.tournament.update({
      data: {
        advancingContestants: payload.advancingContestants,
        bracketJson: enrichedBracket as unknown as Prisma.InputJsonValue,
        initialEntrants: payload.initialEntrants,
        isActive: payload.isActive,
        maxContestantsPerMatch: payload.maxContestantsPerMatch,
        name: payload.name,
        numRounds: payload.numRounds,
        startDate: new Date(payload.startDate),
      },
      where: { id: tourneyId },
    })
    this.logger.log({ action: 'updateTournament.finish', tourneyId })

    return responseOf(
      await this.toTournamentDto(updated),
      true,
      'Tournament updated successfully.',
    )
  }

  async getTournament(
    tourneyId: string,
  ): Promise<ResponseObject<TournamentDto | null>> {
    this.logger.debug({ action: 'getTournament.start', tourneyId })
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tourneyId },
    })
    if (!tournament) {
      this.logger.warn({ action: 'getTournament.notFound', tourneyId })
      return responseOf(
        null,
        false,
        `Error: Tournament ID ${tourneyId} not found.`,
      )
    }
    this.logger.debug({ action: 'getTournament.finish', tourneyId })

    return responseOf(
      await this.toTournamentDto(tournament),
      true,
      'Tournament metadata retrieved successfully.',
    )
  }

  async updateContestProblem(
    tourneyId: string,
    roundNumber: number,
    contestId: string,
    problemId: string,
  ): Promise<ResponseObject<TournamentDto | null>> {
    this.logger.log({
      action: 'updateContestProblem.start',
      contestId,
      problemId,
      roundNumber,
      tourneyId,
    })
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tourneyId },
    })
    if (!tournament) {
      this.logger.warn({
        action: 'updateContestProblem.tournamentNotFound',
        tourneyId,
      })
      return responseOf(
        null,
        false,
        `Error: Tournament ID ${tourneyId} not found.`,
      )
    }

    const bracket =
      (tournament.bracketJson as unknown as TournamentBracket) || {
        rounds: [],
      }
    const targetRound = bracket.rounds.find(
      (round) => round.roundNumber === roundNumber,
    )
    if (!targetRound) {
      this.logger.warn({
        action: 'updateContestProblem.roundNotFound',
        roundNumber,
        tourneyId,
      })
      return responseOf(
        null,
        false,
        `Error: Round number ${roundNumber} does not exist.`,
      )
    }

    const problem = await this.prisma.problem.findUnique({
      select: { id: true, problemName: true },
      where: { id: problemId },
    })

    const targetContest = targetRound.contests.find(
      (contest) => contest.contestId === contestId,
    )
    if (!targetContest) {
      this.logger.warn({
        action: 'updateContestProblem.contestNotFound',
        contestId,
        roundNumber,
        tourneyId,
      })
      return responseOf(
        null,
        false,
        `Error: Contest ID ${contestId} not found in round ${roundNumber}.`,
      )
    }

    targetContest.problemId = problemId
    targetContest.problemName = problem?.problemName

    const updated = await this.prisma.tournament.update({
      data: {
        bracketJson: bracket as unknown as Prisma.InputJsonValue,
      },
      where: { id: tourneyId },
    })
    this.logger.log({
      action: 'updateContestProblem.finish',
      contestId,
      problemId,
      roundNumber,
      tourneyId,
    })

    return responseOf(
      await this.toTournamentDto(updated),
      true,
      `Problem ${problemId} assigned to Contest ${contestId} successfully.`,
    )
  }

  async listTournaments(): Promise<ResponseObject<TournamentDto[]>> {
    this.logger.debug({ action: 'listTournaments.start' })
    const tournaments = await this.prisma.tournament.findMany({
      orderBy: { createdAt: 'desc' },
    })
    this.logger.debug({
      action: 'listTournaments.finish',
      total: tournaments.length,
    })

    return responseOf(
      await Promise.all(
        tournaments.map((tournament) => this.toTournamentDto(tournament)),
      ),
      true,
      `Retrieved ${tournaments.length} tournaments.`,
    )
  }

  async deleteTournament(
    tourneyId: string,
  ): Promise<ResponseObject<string | null>> {
    this.logger.log({ action: 'deleteTournament.start', tourneyId })
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tourneyId },
    })
    if (!tournament) {
      this.logger.warn({ action: 'deleteTournament.notFound', tourneyId })
      return responseOf(
        null,
        false,
        `Error: Tournament ID ${tourneyId} not found.`,
      )
    }

    await this.prisma.tournament.delete({ where: { id: tourneyId } })
    this.logger.log({ action: 'deleteTournament.finish', tourneyId })
    return responseOf(
      `Deleted ${tourneyId}`,
      true,
      'Tournament deleted successfully.',
    )
  }

  private generateInitialBracket(
    payload: CreateTournamentDto,
  ): TournamentBracket {
    this.logger.debug({ action: 'generateInitialBracket.start', payload })
    const rounds: TournamentBracket['rounds'] = []
    let currentEntrants = payload.initialEntrants
    let currentRound = 1

    while (
      currentRound <= payload.numRounds &&
      currentEntrants > payload.advancingContestants
    ) {
      const matchesInRound = Math.ceil(
        currentEntrants / payload.maxContestantsPerMatch,
      )

      rounds.push({
        contests: Array.from({ length: matchesInRound }, () => ({
          contestId: randomUUID(),
          entrantIds: [],
        })),
        roundName: `Round ${currentRound} (${matchesInRound} Contests)`,
        roundNumber: currentRound,
      })

      currentEntrants = matchesInRound * payload.advancingContestants
      currentRound += 1
    }

    this.logger.debug({
      action: 'generateInitialBracket.finish',
      rounds: rounds.length,
    })
    return { rounds }
  }

  private async attachProblemNames(
    bracket: TournamentBracket,
  ): Promise<TournamentBracket> {
    this.logger.debug({
      action: 'attachProblemNames.start',
      rounds: bracket.rounds.length,
    })
    const ids = Array.from(
      new Set(
        bracket.rounds.flatMap((round) =>
          round.contests
            .map((contest) => contest.problemId?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    )

    const problems = ids.length
      ? await this.prisma.problem.findMany({
          select: { id: true, problemName: true },
          where: { id: { in: ids } },
        })
      : []

    const namesById = new Map(
      problems.map((problem) => [problem.id, problem.problemName]),
    )

    const enriched = {
      rounds: bracket.rounds.map((round) => ({
        ...round,
        contests: round.contests.map((contest) => ({
          ...contest,
          entrantIds: contest.entrantIds ?? [],
          problemId: contest.problemId?.trim(),
          problemName: contest.problemId?.trim()
            ? namesById.get(contest.problemId.trim()) ?? contest.problemName
            : contest.problemName,
        })),
      })),
    }
    if (ids.length > problems.length) {
      const missingIds = ids.filter((id) => !namesById.has(id))
      this.logger.warn({
        action: 'attachProblemNames.problemLookupMissing',
        missingIds,
      })
    }
    this.logger.debug({
      action: 'attachProblemNames.finish',
      mappedProblemCount: problems.length,
    })
    return enriched
  }

  private async toTournamentDto(
    tournament: Tournament,
  ): Promise<TournamentDto> {
    this.logger.verbose({
      action: 'toTournamentDto',
      tournamentId: tournament.id,
    })
    const bracket = await this.attachProblemNames(
      (tournament.bracketJson as unknown as TournamentBracket) || {
        rounds: [],
      },
    )

    return {
      advancingContestants: tournament.advancingContestants,
      bracketStructure: bracket,
      initialEntrants: tournament.initialEntrants,
      intermissionMinutes: tournament.intermissionMinutes,
      isActive: tournament.isActive,
      maxContestantsPerMatch: tournament.maxContestantsPerMatch,
      name: tournament.name,
      numRounds: tournament.numRounds,
      publishedAt: tournament.publishedAt?.toISOString() ?? null,
      roundDurationMinutes: tournament.roundDurationMinutes,
      startDate: tournament.startDate.toISOString(),
      status: tournament.status,
      tourneyId: tournament.id,
    }
  }

  /**
   * Publishes a tournament, creating room records and scheduling deployments.
   * Enforces a single-active-published-tournament constraint.
   */
  async publishTournament(
    tourneyId: string,
  ): Promise<ResponseObject<TournamentDto | null>> {
    this.logger.log({ action: 'publishTournament.start', tourneyId })

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tourneyId },
    })
    if (!tournament) {
      throw new NotFoundException(`Tournament ID ${tourneyId} not found.`)
    }
    if (tournament.status !== 'DRAFT') {
      throw new ConflictException(
        `Tournament is already ${tournament.status.toLowerCase()}.`,
      )
    }

    // Enforce single active published tournament
    const existing = await this.prisma.tournament.findFirst({
      where: {
        id: { not: tourneyId },
        status: { in: ['PUBLISHED', 'IN_PROGRESS'] },
      },
    })
    if (existing) {
      throw new ConflictException(
        `Another tournament ("${existing.name}") is already active. Only one active tournament is allowed.`,
      )
    }

    const bracket =
      (tournament.bracketJson as unknown as TournamentBracket) || { rounds: [] }
    const startDate = tournament.startDate
    const roomRecords: Prisma.RoomCreateManyInput[] = []
    let cumulativeOffsetMs = 0

    for (const round of bracket.rounds) {
      const roundStartMs = startDate.getTime() + cumulativeOffsetMs
      for (const contest of round.contests) {
        const scheduledAt = new Date(roundStartMs)
        const expiresAt = new Date(
          roundStartMs + tournament.roundDurationMinutes * 60 * 1000,
        )
        roomRecords.push({
          contestId: contest.contestId,
          expiresAt,
          roomName: `${round.roundName} - ${contest.contestId.slice(0, 8)}`,
          roundNumber: round.roundNumber,
          scheduledAt,
          status: 'PENDING',
          tournamentId: tourneyId,
        })
      }
      cumulativeOffsetMs +=
        (tournament.roundDurationMinutes + tournament.intermissionMinutes) *
        60 *
        1000
    }

    await this.prisma.room.createMany({ data: roomRecords })
    const updated = await this.prisma.tournament.update({
      data: { publishedAt: new Date(), status: 'PUBLISHED' },
      where: { id: tourneyId },
    })

    this.logger.log({
      action: 'publishTournament.finish',
      roomCount: roomRecords.length,
      tourneyId,
    })

    return responseOf(
      await this.toTournamentDto(updated),
      true,
      `Tournament published with ${roomRecords.length} rooms scheduled.`,
    )
  }

  /** Returns rooms for a given tournament, optionally filtered by status. */
  async getRooms(tourneyId: string): Promise<ResponseObject<RoomDto[]>> {
    const rooms = await this.prisma.room.findMany({
      orderBy: [{ roundNumber: 'asc' }, { createdAt: 'asc' }],
      where: { tournamentId: tourneyId },
    })
    return responseOf(
      rooms.map((r) => ({
        contestId: r.contestId,
        deployedAt: r.deployedAt?.toISOString() ?? null,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        roomId: r.id,
        roomName: r.roomName,
        roundNumber: r.roundNumber,
        scheduledAt: r.scheduledAt.toISOString(),
        status: r.status,
        tournamentId: r.tournamentId,
        url: r.url,
      })),
      true,
      `Retrieved ${rooms.length} rooms.`,
    )
  }

  /** Returns the active published tournament with its rooms for the AI Hub page. */
  async getActiveTournament(): Promise<
    ResponseObject<(TournamentDto & { rooms: RoomDto[] }) | null>
  > {
    const tournament = await this.prisma.tournament.findFirst({
      where: { status: { in: ['PUBLISHED', 'IN_PROGRESS'] } },
    })
    if (!tournament) {
      return responseOf(null, false, 'No active tournament found.')
    }
    const dto = await this.toTournamentDto(tournament)
    const roomsResponse = await this.getRooms(tournament.id)
    return responseOf(
      { ...dto, rooms: roomsResponse.data },
      true,
      'Active tournament retrieved.',
    )
  }
}
