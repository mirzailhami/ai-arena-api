import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'

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

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  roundDurationMinutes?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  intermissionMinutes?: number
}
