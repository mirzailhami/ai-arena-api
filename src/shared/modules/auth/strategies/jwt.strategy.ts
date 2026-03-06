import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { JwtPayloadDto } from '../dto/jwt-payload.dto';

/**
 * JWT Authentication Strategy for Topcoder tokens.
 *
 * Supports RS256 tokens issued by Topcoder's Auth0 tenant.
 * Public keys are fetched automatically from the JWKS endpoint
 * (default: https://auth.topcoder-dev.com/.well-known/jwks.json).
 *
 * Auth accepted via:
 *   - Authorization: Bearer <token>   (Swagger / curl)
 *   - sessionId: <token>              (platform-ui default)
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly validIssuers: string[];

  constructor(private configService: ConfigService) {
    const jwksUri = configService.get<string>(
      'auth.jwksUri',
      'https://auth.topcoder-dev.com/.well-known/jwks.json',
    );
    const issuers = configService.get<string[]>('auth.validIssuers', []);

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Standard Authorization: Bearer header (Swagger / curl)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // platform-ui sends JWT in the 'sessionId' request header
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req: any) => (req?.headers?.['sessionid'] as string) || null,
      ]),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri,
      }),
      algorithms: ['RS256'],
      ignoreExpiration: false,
    });

    this.validIssuers = issuers.filter(Boolean);
    this.logger.log(
      `JWT Strategy initialized. JWKS: ${jwksUri}  Issuers: ${this.validIssuers.join(', ')}`,
    );
  }

  async validate(payload: JwtPayloadDto): Promise<JwtPayloadDto> {
    if (this.validIssuers.length > 0 && !this.validIssuers.includes(payload.iss)) {
      this.logger.warn(`Invalid token issuer: ${payload.iss}`);
      throw new UnauthorizedException('Invalid token issuer');
    }

    const userId = payload.sub || payload.userId;
    if (!userId) {
      throw new UnauthorizedException('Invalid token: missing user ID');
    }

    return { ...payload, sub: userId };
  }
}
