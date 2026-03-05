import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller';
import {
  DockerfileMergeService,
  DockerTestService,
  LibraryService,
  ZipValidatorService,
} from './services';

/**
 * Module for Problem Library feature.
 * Handles problem upload, ZIP validation, Docker testing, and CRUD operations.
 */
@Module({
  controllers: [LibraryController],
  providers: [LibraryService, ZipValidatorService, DockerfileMergeService, DockerTestService],
  exports: [LibraryService],
})
export class LibraryModule {}
