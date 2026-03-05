import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global JWT authentication guard.
 * Protects all routes by default unless marked with @Public() decorator.
 *
 * Based on reference implementations from projects-api-v6 / review-api-v6.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * Determines if the current route requires authentication.
   * Routes marked with @Public() decorator skip authentication.
   */
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      this.logger.debug(`Public route accessed: ${context.getHandler().name}`);
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * Custom error handling for authentication failures.
   * Logs warning and delegates to Passport's default error handling.
   */
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      const request = context.switchToHttp().getRequest();
      this.logger.warn(
        `Authentication failed for ${request.method} ${request.url}: ${info?.message || 'No token provided'}`,
      );
    }

    return super.handleRequest(err, user, info, context);
  }
}
