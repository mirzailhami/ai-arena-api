import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for Docker test endpoint.
 */
export class TestResultDto {
  @ApiProperty({ example: true })
  buildSuccess: boolean;

  @ApiProperty({ example: true })
  testPassed: boolean;

  @ApiProperty({ example: 'Docker build logs...' })
  buildLog: string;

  @ApiProperty({ example: 'Container runtime output...' })
  runtimeLog: string;

  @ApiProperty({ example: 0 })
  exitCode: number;

  @ApiProperty({ example: 5234 })
  durationMs: number;
}
