import { ApiProperty } from '@nestjs/swagger';

export class ContestDto {
  @ApiProperty({ example: '69e90fcd-b86b-4d6b-9281-336ae3bd15b4' })
  contestId: string;

  @ApiProperty({ example: null, nullable: true })
  problemId: string | null;

  @ApiProperty({ example: null, nullable: true, type: [String] })
  entrantIds: string[] | null;

  @ApiProperty({ example: null, nullable: true })
  winnerId: string | null;
}

export class RoundDto {
  @ApiProperty({ example: 1 })
  roundNumber: number;

  @ApiProperty({ example: 'Round 1 (4 Contests)' })
  roundName: string;

  @ApiProperty({ type: [ContestDto] })
  contests: ContestDto[];
}

export class BracketStructureDto {
  @ApiProperty({ type: [RoundDto] })
  rounds: RoundDto[];
}

export class TourneyResponseDto {
  @ApiProperty({ example: '63fd0f73-ce2c-45f2-9da3-11a6440687e7' })
  tourneyId: string;

  @ApiProperty({ example: 'Sample Tourney' })
  name: string;

  @ApiProperty({ example: 3 })
  numRounds: number;

  @ApiProperty({ example: 8 })
  initialEntrants: number;

  @ApiProperty({ example: 2 })
  maxContestantsPerMatch: number;

  @ApiProperty({ example: 1 })
  advancingContestants: number;

  @ApiProperty({ example: 1772751041403, description: 'Unix timestamp in ms' })
  startDate: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ type: BracketStructureDto })
  bracketStructure: BracketStructureDto;
}
