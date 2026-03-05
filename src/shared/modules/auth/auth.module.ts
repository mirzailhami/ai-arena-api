import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies';

/**
 * Authentication module for JWT token validation.
 * Provides Topcoder JWT authentication strategy and guards.
 *
 * Based on reference implementations from projects-api-v6 / review-api-v6.
 */
@Module({
  imports: [ConfigModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
