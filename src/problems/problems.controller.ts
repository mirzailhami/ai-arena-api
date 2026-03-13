import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Request } from 'express'

import { ResponseObject } from '../common/api-response'
import { ArenaAuthGuard } from '../common/auth.guard'
import { SourceProblem } from './problem.types'
import { ProblemsService } from './problems.service'

@Controller('problem')
@UseGuards(ArenaAuthGuard)
export class ProblemsController {
  constructor(private readonly problemsService: ProblemsService) {}

  @Post('upload')
  uploadProblem(
    @Req() req: Request & { body: Buffer },
    @Headers('content-disposition') contentDisposition?: string,
    @Headers('x-problem-name') problemNameHeader?: string,
  ): Promise<ResponseObject<SourceProblem>> {
    return this.problemsService.uploadProblem(
      req.body,
      contentDisposition ?? '',
      problemNameHeader,
    )
  }

  @Post('test/:problemId')
  testProblem(
    @Param('problemId') problemId: string,
  ): Promise<ResponseObject<string>> {
    return this.problemsService.testProblem(problemId)
  }

  @Get(':problemId/log')
  getProblemLog(
    @Param('problemId') problemId: string,
  ): Promise<ResponseObject<string | null>> {
    return this.problemsService.getProblemLog(problemId)
  }

  @Get('list')
  listProblems(): Promise<ResponseObject<SourceProblem[]>> {
    return this.problemsService.listProblems()
  }

  @Get(':problemId')
  getProblem(
    @Param('problemId') problemId: string,
  ): Promise<ResponseObject<SourceProblem | null>> {
    return this.problemsService.getProblem(problemId)
  }

  @Delete(':problemId')
  deleteProblem(
    @Param('problemId') problemId: string,
  ): Promise<ResponseObject<null>> {
    return this.problemsService.deleteProblem(problemId)
  }

  @Post('flag/:problemId')
  flagProblem(
    @Param('problemId') problemId: string,
    @Body() body: boolean | { isContestReady?: boolean | string } | string,
  ): Promise<ResponseObject<SourceProblem | null>> {
    const isContestReady =
      typeof body === 'boolean'
        ? body
        : typeof body === 'string'
          ? body === 'true'
          : body?.isContestReady === true || body?.isContestReady === 'true'

    return this.problemsService.flagProblem(problemId, isContestReady)
  }
}
