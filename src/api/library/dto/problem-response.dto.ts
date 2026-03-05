import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for problem list and single problem endpoints.
 */
export class ProblemResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'My AI Problem' })
  name: string;

  @ApiProperty({ example: 'Problem description', required: false })
  description?: string;

  @ApiProperty({ example: 'Passed', enum: ['Pending Test', 'Testing', 'Passed', 'Failed'] })
  status: string;

  @ApiProperty({ example: 'my-problem.zip', required: false })
  zipFileName?: string;

  @ApiProperty({ example: '/problems/123/my-problem.zip', required: false })
  zipFilePath?: string;

  @ApiProperty({ example: false })
  isTested: boolean;

  @ApiProperty({ example: false })
  isContestReady: boolean;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T12:05:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ example: 'user-123', required: false })
  createdBy?: string;

  @ApiProperty({ example: 'Build successful...', required: false })
  buildLog?: string;
}
