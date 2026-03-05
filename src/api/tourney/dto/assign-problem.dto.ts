import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

/**
 * DTO for assigning a problem to a contest.
 */
export class AssignProblemDto {
  @ApiProperty({ example: 1, description: 'Round number (1-based)' })
  @IsInt()
  @Min(1)
  roundNumber: number;

  @ApiProperty({ example: 0, description: 'Contest index within the round (0-based)' })
  @IsInt()
  @Min(0)
  contestIndex: number;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Problem ID (UUID)',
  })
  @IsUUID()
  problemId: string;
}
