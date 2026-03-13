export interface TournamentContest {
  contestId: string
  problemId?: string
  problemName?: string
  entrantIds: string[]
  winnerId?: string
}

export interface TournamentRound {
  roundNumber: number
  roundName: string
  contests: TournamentContest[]
}

export interface TournamentBracket {
  rounds: TournamentRound[]
}

export interface TournamentDto {
  tourneyId: string
  name: string
  numRounds: number
  initialEntrants: number
  maxContestantsPerMatch: number
  advancingContestants: number
  startDate: string
  roundDurationMinutes: number
  intermissionMinutes: number
  isActive: boolean
  status: string
  publishedAt: string | null
  bracketStructure: TournamentBracket
}

export interface RoomDto {
  roomId: string
  tournamentId: string
  roundNumber: number
  contestId: string
  roomName: string
  url: string | null
  status: string
  scheduledAt: string
  deployedAt: string | null
  expiresAt: string | null
}
