import { Injectable, Logger } from '@nestjs/common';
import { Contest, Round } from '@prisma/client';
import { CreateTourneyDto } from '../dto';

/**
 * Service for generating tournament bracket structures.
 * Ports bracket generation logic from Java TourneyManagerResource.generateInitialBracket().
 *
 * Algorithm:
 * 1. Start with initialEntrants (X)
 * 2. For each round:
 *    - Calculate matches needed: ceil(currentEntrants / maxContestantsPerMatch)
 *    - Create that many empty contests (no entrants/problems assigned yet)
 *    - Calculate entrants for next round: matchesInRound * advancingContestants
 * 3. Continue until numRounds reached OR currentEntrants <= advancingContestants
 */
@Injectable()
export class BracketGeneratorService {
  private readonly logger = new Logger(BracketGeneratorService.name);

  /**
   * Generates initial bracket structure (rounds with empty contests).
   *
   * @param config - Tournament configuration
   * @returns Array of rounds with contests (no IDs - will be created by Prisma)
   */
  generateBracket(config: CreateTourneyDto): Array<{
    roundNumber: number;
    roundName: string;
    contests: Array<{ entrantIds: string[] }>;
  }> {
    const rounds: Array<{
      roundNumber: number;
      roundName: string;
      contests: Array<{ entrantIds: string[] }>;
    }> = [];

    let currentEntrants = config.initialEntrants;
    let currentRound = 1;

    this.logger.log(
      `Generating bracket: ${config.numRounds} rounds, ${config.initialEntrants} initial entrants`,
    );

    while (
      currentRound <= config.numRounds &&
      currentEntrants > config.advancingContestants
    ) {
      // Calculate matches in this round
      const matchesInRound = Math.ceil(currentEntrants / config.maxContestantsPerMatch);

      const round = {
        roundNumber: currentRound,
        roundName: `Round ${currentRound} (${matchesInRound} Contests)`,
        contests: Array.from({ length: matchesInRound }, () => ({
          entrantIds: [], // Empty initially - entrants assigned by tournament organizer
        })),
      };

      rounds.push(round);

      this.logger.log(
        `Round ${currentRound}: ${matchesInRound} matches, ${currentEntrants} entrants → ${matchesInRound * config.advancingContestants} advance`,
      );

      // Calculate entrants for next round
      currentEntrants = matchesInRound * config.advancingContestants;
      currentRound++;
    }

    this.logger.log(`Generated bracket with ${rounds.length} rounds`);
    return rounds;
  }
}
