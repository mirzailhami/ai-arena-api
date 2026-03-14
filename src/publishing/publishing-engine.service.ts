import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'

import { PrismaService } from '../prisma/prisma.service'
import { FargateService } from '../fargate/fargate.service'
import { ImageBuilderService } from '../fargate/image-builder.service'
import { LoggerService } from '../shared/modules/global/logger.service'

/** Emitted when a room needs to be deployed (1 hour before scheduled open). */
export const ROOM_DEPLOY_EVENT = 'room.deploy'

/** Emitted when a room has expired and should be undeployed. */
export const ROOM_UNDEPLOY_EVENT = 'room.undeploy'

interface RoomDeployPayload {
  roomId: string
  securityGroupId: string
  taskDefinitionArn: string
}

interface RoomUndeployPayload {
  roomId: string
}

@Injectable()
export class PublishingEngineService {
  private readonly logger = LoggerService.forRoot('PublishingEngine')

  constructor(
    private readonly prisma: PrismaService,
    private readonly fargate: FargateService,
    private readonly imageBuilder: ImageBuilderService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Cron job that runs every minute to check for rooms that need
   * to be deployed (1 hour before opening) or undeployed (expired).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkScheduledRooms(): Promise<void> {
    const now = new Date()
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)

    // Find rooms that should be deployed (scheduled within the next hour, still PENDING)
    const roomsToDeploy = await this.prisma.room.findMany({
      where: {
        scheduledAt: { lte: oneHourFromNow },
        status: 'PENDING',
      },
    })

    if (roomsToDeploy.length > 0) {
      // Mark all as DEPLOYING immediately to prevent duplicate triggers on next cron tick
      await this.prisma.room.updateMany({
        data: { status: 'DEPLOYING' },
        where: { id: { in: roomsToDeploy.map((r) => r.id) } },
      })

      // Resolve image URI once (may trigger Docker build on first call)
      const imageUri = await this.resolveImageUri()

      // Register ECS task definition and security group once for all rooms
      const geminiApiKey = process.env.GEMINI_API_KEY || ''
      const taskDefinitionArn = await this.fargate.registerTaskDefinition(imageUri, geminiApiKey)
      const securityGroupId = await this.fargate.ensureSecurityGroup()

      for (const room of roomsToDeploy) {
        this.logger.log({
          action: 'checkScheduledRooms.triggerDeploy',
          roomId: room.id,
          scheduledAt: room.scheduledAt.toISOString(),
        })
        this.eventEmitter.emit(ROOM_DEPLOY_EVENT, {
          securityGroupId,
          taskDefinitionArn,
          roomId: room.id,
        } satisfies RoomDeployPayload)
      }
    }

    // Find rooms that have expired and should be undeployed
    const roomsToUndeploy = await this.prisma.room.findMany({
      where: {
        expiresAt: { lte: now },
        status: 'RUNNING',
      },
    })

    for (const room of roomsToUndeploy) {
      this.logger.log({
        action: 'checkScheduledRooms.triggerUndeploy',
        roomId: room.id,
      })
      this.eventEmitter.emit(ROOM_UNDEPLOY_EVENT, {
        roomId: room.id,
      } satisfies RoomUndeployPayload)
    }

    // Check if all rooms are stopped/failed → mark tournament as COMPLETED
    await this.checkTournamentCompletion()
  }

  @OnEvent(ROOM_DEPLOY_EVENT)
  async handleRoomDeploy(payload: RoomDeployPayload): Promise<void> {
    const { securityGroupId, taskDefinitionArn, roomId } = payload
    this.logger.log({ action: 'handleRoomDeploy.start', roomId })

    try {
      const result = await this.fargate.deployRoom(roomId, taskDefinitionArn, securityGroupId)

      await this.prisma.room.update({
        data: {
          deployedAt: new Date(),
          status: 'RUNNING',
          taskArn: result.taskArn,
          url: result.url,
        },
        where: { id: roomId },
      })

      // Mark tournament as IN_PROGRESS once first room is deployed
      const room = await this.prisma.room.findUnique({ where: { id: roomId } })
      if (room) {
        await this.prisma.tournament.updateMany({
          data: { status: 'IN_PROGRESS' },
          where: { id: room.tournamentId, status: 'PUBLISHED' },
        })
      }

      this.logger.log({
        action: 'handleRoomDeploy.success',
        roomId,
        url: result.url,
      })
    } catch (error) {
      this.logger.error(
        {
          action: 'handleRoomDeploy.failed',
          error: error instanceof Error ? error.message : String(error),
          roomId,
        },
        error instanceof Error ? error.stack : undefined,
      )

      await this.prisma.room.update({
        data: { status: 'FAILED' },
        where: { id: roomId },
      })
    }
  }

  @OnEvent(ROOM_UNDEPLOY_EVENT)
  async handleRoomUndeploy(payload: RoomUndeployPayload): Promise<void> {
    const { roomId } = payload
    this.logger.log({ action: 'handleRoomUndeploy.start', roomId })

    try {
      await this.prisma.room.update({
        data: { status: 'STOPPING' },
        where: { id: roomId },
      })

      await this.fargate.undeployRoom(roomId)

      await this.prisma.room.update({
        data: { status: 'STOPPED', url: null },
        where: { id: roomId },
      })

      this.logger.log({ action: 'handleRoomUndeploy.success', roomId })
    } catch (error) {
      this.logger.error(
        {
          action: 'handleRoomUndeploy.failed',
          error: error instanceof Error ? error.message : String(error),
          roomId,
        },
        error instanceof Error ? error.stack : undefined,
      )

      await this.prisma.room.update({
        data: { status: 'FAILED' },
        where: { id: roomId },
      })
    }
  }

  /** Resolves the ECR image URI, building and pushing if needed. */
  private async resolveImageUri(): Promise<string> {
    const cached = this.imageBuilder.getImageUri()
    if (cached) return cached

    const arenaSourceDir =
      process.env.ARENA_SOURCE_DIR || './data/arena-source'
    return this.imageBuilder.buildAndPush(arenaSourceDir)
  }

  /** Checks if all rooms for a tournament are done, marks it COMPLETED. */
  private async checkTournamentCompletion(): Promise<void> {
    const activeTournaments = await this.prisma.tournament.findMany({
      where: { status: 'IN_PROGRESS' },
    })

    for (const tournament of activeTournaments) {
      const pendingRooms = await this.prisma.room.count({
        where: {
          status: { in: ['PENDING', 'DEPLOYING', 'RUNNING', 'STOPPING'] },
          tournamentId: tournament.id,
        },
      })

      if (pendingRooms === 0) {
        await this.prisma.tournament.update({
          data: { status: 'COMPLETED' },
          where: { id: tournament.id },
        })
        this.logger.log({
          action: 'checkTournamentCompletion.completed',
          tournamentId: tournament.id,
        })
      }
    }
  }
}
