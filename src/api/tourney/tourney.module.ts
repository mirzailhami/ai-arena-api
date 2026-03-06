import { Module } from '@nestjs/common';
import { TourneyController } from './tourney.controller';
import { BracketGeneratorService, TourneyService } from './services';

/**
 * Module for Tournament feature.
 */
@Module({
  controllers: [TourneyController],
  providers: [TourneyService, BracketGeneratorService],
  exports: [TourneyService],
})
export class TourneyModule {}
