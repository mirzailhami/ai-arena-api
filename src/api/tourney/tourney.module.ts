import { Module } from '@nestjs/common';
import { TourneyController } from './tourney.controller';
import { TourneyRefController } from './tourney-ref.controller';
import { BracketGeneratorService, TourneyService } from './services';

/**
 * Module for Tournament feature.
 * Handles tournament creation, bracket generation, and CRUD operations.
 */
@Module({
  controllers: [TourneyController, TourneyRefController],
  providers: [TourneyService, BracketGeneratorService],
  exports: [TourneyService],
})
export class TourneyModule {}
