import { ApiProperty } from '@nestjs/swagger';
import { Problem } from '@prisma/client';

/**
 * Response DTO matching the platform-ui SourceProblem model.
 * Field names (problemId, problemName) match the UI contract exactly.
 */
export class SourceProblemDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  problemId: string;

  @ApiProperty({ example: 'My AI Problem' })
  problemName: string;

  @ApiProperty({ example: false })
  isTested: boolean;

  @ApiProperty({ example: false })
  isContestReady: boolean;

  @ApiProperty({
    example: 'Passed',
    enum: ['Pending Test', 'Testing', 'Passed', 'Failed'],
    required: false,
  })
  status?: string;
}

export function toSourceProblem(p: Problem): SourceProblemDto {
  return {
    problemId: p.id,
    problemName: p.name,
    isTested: p.isTested,
    isContestReady: p.isContestReady,
    status: p.status,
  };
}
