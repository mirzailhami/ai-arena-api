import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator'

export class CreateTournamentDto {
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
}
