import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayloadDto } from '../dto/jwt-payload.dto';

/**
 * Custom decorator to extract the authenticated user from the request.
 * Usage: @CurrentUser() user: JwtPayloadDto
 *
 * Example:
 * ```typescript
 * @Get('profile')
 * getProfile(@CurrentUser() user: JwtPayloadDto) {
 *   return { userId: user.sub, handle: user.handle };
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): JwtPayloadDto => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
