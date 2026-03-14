import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'

export class UpdateTournamentDto {
  @IsString()
  @IsNotEmpty()
  tourneyId!: string

  @IsString()
  @IsNotEmpty()
  name!: string

  @IsInt()
  @Min(1)
  numRounds!: number

  @IsInt()
  @Min(2)
  initialEntrants!: number

  @IsInt()
  @Min(2)
  maxContestantsPerMatch!: number

  @IsInt()
  @Min(1)
  advancingContestants!: number

  @IsString()
  @IsNotEmpty()
  startDate!: string

  @IsOptional()
  @IsInt()
  @Min(1)
  roundDurationMinutes?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  intermissionMinutes?: number

  @IsBoolean()
  isActive!: boolean

  @IsObject()
  bracketStructure!: {
    rounds: Array<{
      roundNumber: number
      roundName: string
      contests: Array<{
        contestId: string
        problemId?: string
        problemName?: string
        entrantIds?: string[]
        winnerId?: string
      }>
    }>
  }
}
