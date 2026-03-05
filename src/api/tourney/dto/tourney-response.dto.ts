import { ApiProperty } from '@nestjs/swagger';

/**
 * Represents a single contest/match within a round.
 */
export class ContestDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '456e7890-e89b-12d3-a456-426614174000', required: false })
  problemId?: string;

  @ApiProperty({ example: ['entrant1', 'entrant2'], type: [String] })
  entrantIds: string[];

  @ApiProperty({ example: 'entrant1', required: false })
  winnerId?: string;
}

/**
 * Represents one round of the tournament.
 */
export class RoundDto {
  @ApiProperty({ example: '789e0123-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 1 })
  roundNumber: number;

  @ApiProperty({ example: 'Round 1 (8 Contests)' })
  roundName: string;

  @ApiProperty({ type: [ContestDto] })
  contests: ContestDto[];
}

/**
 * Tournament response DTO with full bracket structure.
 */
export class TourneyResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'Grand Championship 2026' })
  name: string;

  @ApiProperty({ example: 4 })
  numRounds: number;

  @ApiProperty({ example: 32 })
  initialEntrants: number;

  @ApiProperty({ example: 4 })
  maxContestantsPerMatch: number;

  @ApiProperty({ example: 1 })
  advancingContestants: number;

  @ApiProperty({ example: '2026-01-01T12:00:00.000Z' })
  startDate: Date;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: 'user-123', required: false })
  createdBy?: string;

  @ApiProperty({ type: [RoundDto], description: 'Full bracket structure with rounds and contests' })
  rounds: RoundDto[];
}
