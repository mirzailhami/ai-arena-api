import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateContestDto {
  @ApiProperty({ example: '69e90fcd-b86b-4d6b-9281-336ae3bd15b4' })
  @IsUUID()
  contestId: string;

  @ApiProperty({ example: '3d509024-ecfe-4e20-a9d2-ab68d86afbb5', nullable: true })
  @IsOptional()
  @IsUUID()
  problemId: string | null;

  @ApiProperty({ nullable: true })
  @IsOptional()
  entrantIds: string[] | null;

  @ApiProperty({ nullable: true })
  @IsOptional()
  winnerId: string | null;
}

export class UpdateRoundDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  roundNumber: number;

  @ApiProperty({ example: 'Round 1 (4 Contests)' })
  @IsString()
  roundName: string;

  @ApiProperty({ type: [UpdateContestDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateContestDto)
  contests: UpdateContestDto[];
}

export class UpdateBracketStructureDto {
  @ApiProperty({ type: [UpdateRoundDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRoundDto)
  rounds: UpdateRoundDto[];
}

export class UpdateTourneyBracketDto {
  @ApiProperty()
  @IsUUID()
  tourneyId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsNumber()
  numRounds: number;

  @ApiProperty()
  @IsNumber()
  initialEntrants: number;

  @ApiProperty()
  @IsNumber()
  maxContestantsPerMatch: number;

  @ApiProperty()
  @IsNumber()
  advancingContestants: number;

  @ApiProperty()
  @IsNumber()
  startDate: number;

  @ApiProperty()
  @IsBoolean()
  isActive: boolean;

  @ApiProperty({ type: UpdateBracketStructureDto })
  @ValidateNested()
  @Type(() => UpdateBracketStructureDto)
  bracketStructure: UpdateBracketStructureDto;
}
