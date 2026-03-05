import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for public routes (skip JWT authentication).
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator to mark a route as public (no authentication required).
 * Use on controller methods that should be accessible without a JWT token.
 *
 * Example:
 * ```typescript
 * @Public()
 * @Get('health')
 * healthCheck() {
 *   return { status: 'ok' };
 * }
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
