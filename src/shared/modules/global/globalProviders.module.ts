import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * GlobalProvidersModule exports shared services that are available globally.
 * @Global decorator makes it available to all modules without importing.
 * Follows Topcoder service architecture pattern.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class GlobalProvidersModule {}
