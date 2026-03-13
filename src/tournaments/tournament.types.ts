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
  isActive: boolean
  bracketStructure: TournamentBracket
}
