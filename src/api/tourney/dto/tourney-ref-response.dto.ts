import { ApiProperty } from '@nestjs/swagger';

/**
 * Reference-compatible response DTOs matching the Java ai-arena-backend-api contract.
 *
 * Shape used by:
 *   POST /tourney/create
 *   PUT  /tourney/:id
 *
 * Key differences from TourneyResponseDto:
 *   - top-level field is `tourneyId` (not `id`)
 *   - rounds are nested under `bracketStructure.rounds` (not flat `rounds`)
 *   - contest uses `contestId` (not `id`)
 *   - `startDate` is a Unix timestamp in milliseconds (not ISO string)
 *   - `entrantIds` / `winnerId` are explicit null when unset
 */

export class RefContestDto {
  @ApiProperty({ example: '69e90fcd-b86b-4d6b-9281-336ae3bd15b4' })
  contestId: string;

  @ApiProperty({ example: null, nullable: true })
  problemId: string | null;

  @ApiProperty({ example: null, nullable: true, type: [String] })
  entrantIds: string[] | null;

  @ApiProperty({ example: null, nullable: true })
  winnerId: string | null;
}

export class RefRoundDto {
  @ApiProperty({ example: 1 })
  roundNumber: number;

  @ApiProperty({ example: 'Round 1 (4 Contests)' })
  roundName: string;

  @ApiProperty({ type: [RefContestDto] })
  contests: RefContestDto[];
}

export class RefBracketStructureDto {
  @ApiProperty({ type: [RefRoundDto] })
  rounds: RefRoundDto[];
}

export class TourneyRefResponseDto {
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

  @ApiProperty({ type: RefBracketStructureDto })
  bracketStructure: RefBracketStructureDto;
}
