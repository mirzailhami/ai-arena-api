import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'

import { ResponseObject } from '../common/api-response'
import { ArenaAuthGuard } from '../common/auth.guard'
import { CreateTournamentDto } from './dto/create-tournament.dto'
import { UpdateTournamentDto } from './dto/update-tournament.dto'
import { RoomDto, TournamentDto } from './tournament.types'
import { TournamentsService } from './tournaments.service'

@Controller('tourney')
@UseGuards(ArenaAuthGuard)
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Post('create')
  createTournament(
    @Body() payload: CreateTournamentDto,
  ): Promise<ResponseObject<TournamentDto>> {
    return this.tournamentsService.createTournament(payload)
  }

  @Put(':tourneyId')
  updateTournament(
    @Param('tourneyId') tourneyId: string,
    @Body() payload: UpdateTournamentDto,
  ): Promise<ResponseObject<TournamentDto | null>> {
    return this.tournamentsService.updateTournament(tourneyId, payload)
  }

  @Put(':tourneyId/round/:roundNumber/contest/:contestId/problem/:problemId')
  updateContestProblem(
    @Param('contestId') contestId: string,
    @Param('problemId') problemId: string,
    @Param('roundNumber') roundNumber: string,
    @Param('tourneyId') tourneyId: string,
  ): Promise<ResponseObject<TournamentDto | null>> {
    return this.tournamentsService.updateContestProblem(
      tourneyId,
      Number(roundNumber),
      contestId,
      problemId,
    )
  }

  @Get('list')
  listTournaments(): Promise<ResponseObject<TournamentDto[]>> {
    return this.tournamentsService.listTournaments()
  }

  @Get('active/hub')
  getActiveTournament(): Promise<
    ResponseObject<(TournamentDto & { rooms: RoomDto[] }) | null>
  > {
    return this.tournamentsService.getActiveTournament()
  }

  @Get(':tourneyId')
  getTournament(
    @Param('tourneyId') tourneyId: string,
  ): Promise<ResponseObject<TournamentDto | null>> {
    return this.tournamentsService.getTournament(tourneyId)
  }

  @Delete(':tourneyId')
  deleteTournament(
    @Param('tourneyId') tourneyId: string,
  ): Promise<ResponseObject<string | null>> {
    return this.tournamentsService.deleteTournament(tourneyId)
  }

  @Post(':tourneyId/publish')
  publishTournament(
    @Param('tourneyId') tourneyId: string,
  ): Promise<ResponseObject<TournamentDto | null>> {
    return this.tournamentsService.publishTournament(tourneyId)
  }

  @Get(':tourneyId/rooms')
  getRooms(
    @Param('tourneyId') tourneyId: string,
  ): Promise<ResponseObject<RoomDto[]>> {
    return this.tournamentsService.getRooms(tourneyId)
  }
}
