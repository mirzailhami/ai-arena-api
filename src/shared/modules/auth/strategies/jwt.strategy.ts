import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayloadDto } from '../dto/jwt-payload.dto';

/**
 * JWT Authentication Strategy for Topcoder tokens.
 * Validates JWT tokens issued by Topcoder Auth0 (HS256 or RS256).
 *
 * Based on reference implementations from projects-api-v6 / review-api-v6.
 * Supports multiple issuers (dev + prod environments).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly validIssuers: string[];

  constructor(private configService: ConfigService) {
    const secret = configService.get<string>('auth.secret');
    const issuers = configService.get<string[]>('auth.validIssuers', []);

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256', 'RS256'],
    });

    this.validIssuers = issuers.filter(Boolean);
    this.logger.log(`JWT Strategy initialized. Valid issuers: ${this.validIssuers.join(', ')}`);
  }

  /**
   * Validates JWT payload and returns user object.
   * Called automatically by Passport after JWT signature verification.
   *
   * @param payload - Decoded JWT payload
   * @returns User object to be attached to request.user
   * @throws UnauthorizedException if issuer is invalid
   */
  async validate(payload: JwtPayloadDto): Promise<JwtPayloadDto> {
    // Validate issuer
    if (!this.validIssuers.includes(payload.iss)) {
      this.logger.warn(`Invalid token issuer: ${payload.iss}`);
      throw new UnauthorizedException('Invalid token issuer');
    }

    // Normalize userId field (some tokens use 'sub', others use 'userId')
    const userId = payload.sub || payload.userId;
    if (!userId) {
      this.logger.warn('Token missing user ID (sub or userId field)');
      throw new UnauthorizedException('Invalid token: missing user ID');
    }

    return {
      ...payload,
      sub: userId,
    };
  }
}
