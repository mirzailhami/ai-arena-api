import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, Max, IsOptional, IsDateString } from 'class-validator';

/**
 * DTO for creating a new tournament.
 * Ports Tournament POJO from Part 1 Java source.
 */
export class CreateTourneyDto {
  @ApiProperty({ example: 'Grand Championship 2026', description: 'Tournament name' })
  @IsString()
  name: string;

  @ApiProperty({
    example: 4,
    description: 'Number of rounds (N)',
    minimum: 1,
    maximum: 10,
  })
  @IsInt()
  @Min(1)
  @Max(10)
  numRounds: number;

  @ApiProperty({
    example: 32,
    description: 'Initial number of entrants (X)',
    minimum: 2,
    maximum: 1000,
  })
  @IsInt()
  @Min(2)
  @Max(1000)
  initialEntrants: number;

  @ApiProperty({
    example: 4,
    description: 'Maximum contestants per match (Y)',
    minimum: 2,
    maximum: 10,
  })
  @IsInt()
  @Min(2)
  @Max(10)
  maxContestantsPerMatch: number;

  @ApiProperty({
    example: 1,
    description: 'Number of contestants advancing from each match (Z)',
    minimum: 1,
    maximum: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  advancingContestants: number;

  @ApiProperty({ example: '2026-03-10T00:00:00.000Z', description: 'Tournament start date (ISO 8601)', required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;
}
