import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

import { PrismaService } from '../prisma/prisma.service'
import { FargateService } from '../fargate/fargate.service'
import { ImageBuilderService } from '../fargate/image-builder.service'
import { LoggerService } from '../shared/modules/global/logger.service'
import { SqsService, type RoomMessage } from './sqs.service'
import { SchedulerService } from './scheduler.service'

@Injectable()
export class PublishingEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = LoggerService.forRoot('PublishingEngine')
  private consumerRunning = false
  private consumerTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly fargate: FargateService,
    private readonly imageBuilder: ImageBuilderService,
    private readonly sqsService: SqsService,
    private readonly schedulerService: SchedulerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.startConsumer()
  }

  onModuleDestroy(): void {
    this.stopConsumer()
  }

  // ---------------------------------------------------------------------------
  // SQS Consumer — polls deployment queue and processes messages
  // ---------------------------------------------------------------------------

  private startConsumer(): void {
    this.consumerRunning = true
    this.consumerTimer = setInterval(() => {
      void this.pollMessages()
    }, 10_000) // poll every 10 seconds
    this.logger.log({ action: 'sqsConsumer.started' })
  }

  private stopConsumer(): void {
    this.consumerRunning = false
    if (this.consumerTimer) {
      clearInterval(this.consumerTimer)
      this.consumerTimer = null
    }
    this.logger.log({ action: 'sqsConsumer.stopped' })
  }

  private async pollMessages(): Promise<void> {
    if (!this.consumerRunning) return
    try {
      const messages = await this.sqsService.receiveMessages()
      for (const msg of messages) {
        await this.processMessage(msg.body, msg.receiptHandle)
      }
    } catch (error) {
      this.logger.error(
        {
          action: 'sqsConsumer.pollError',
          error: error instanceof Error ? error.message : String(error),
        },
        error instanceof Error ? error.stack : undefined,
      )
    }
  }

  private async processMessage(
    message: RoomMessage,
    receiptHandle: string,
  ): Promise<void> {
    this.logger.log({
      action: 'processMessage.start',
      messageAction: message.action,
      roomId: message.roomId,
    })

    try {
      if (message.action === 'DEPLOY') {
        await this.handleRoomDeploy(message.roomId)
      } else if (message.action === 'UNDEPLOY') {
        await this.handleRoomUndeploy(message.roomId)
      }

      // Delete the message on success — if we crash before this,
      // SQS will redeliver after the visibility timeout expires
      await this.sqsService.deleteMessage(receiptHandle)
    } catch (error) {
      // Don't delete the message — SQS will retry after visibility timeout.
      // After maxReceiveCount (3) failures it moves to the DLQ.
      this.logger.error(
        {
          action: 'processMessage.failed',
          error: error instanceof Error ? error.message : String(error),
          messageAction: message.action,
          roomId: message.roomId,
        },
        error instanceof Error ? error.stack : undefined,
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Reconciliation cron — defense-in-depth fallback (every 5 minutes)
  // Catches rooms that EventBridge Scheduler or SQS somehow missed.
  // ---------------------------------------------------------------------------

  @Cron('*/5 * * * *')
  async reconcileScheduledRooms(): Promise<void> {
    const now = new Date()
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)

    // Find PENDING rooms that should have been deployed by now
    const missedRooms = await this.prisma.room.findMany({
      where: {
        scheduledAt: { lte: oneHourFromNow },
        status: 'PENDING',
      },
    })

    for (const room of missedRooms) {
      this.logger.warn({
        action: 'reconcile.deployMissed',
        roomId: room.id,
        scheduledAt: room.scheduledAt.toISOString(),
      })
      await this.sqsService.sendMessage({ action: 'DEPLOY', roomId: room.id })
    }

    // Find RUNNING rooms that have expired
    const expiredRooms = await this.prisma.room.findMany({
      where: {
        expiresAt: { lte: now },
        status: 'RUNNING',
      },
    })

    for (const room of expiredRooms) {
      this.logger.warn({
        action: 'reconcile.undeployMissed',
        roomId: room.id,
      })
      await this.sqsService.sendMessage({ action: 'UNDEPLOY', roomId: room.id })
    }

    // Check tournament completion
    await this.checkTournamentCompletion()
  }

  // ---------------------------------------------------------------------------
  // Called by TournamentsService at publish time to create EventBridge schedules
  // ---------------------------------------------------------------------------

  async scheduleRoomDeployments(
    rooms: Array<{ roomId: string; scheduledAt: Date }>,
  ): Promise<void> {
    for (const room of rooms) {
      const fireAt = new Date(room.scheduledAt.getTime() - 60 * 60 * 1000)
      await this.schedulerService.scheduleRoomDeployment(room.roomId, fireAt)
    }
    this.logger.log({
      action: 'scheduleRoomDeployments.complete',
      roomCount: rooms.length,
    })
  }

  // ---------------------------------------------------------------------------
  // Room deployment / undeployment handlers
  // ---------------------------------------------------------------------------

  private async handleRoomDeploy(roomId: string): Promise<void> {
    this.logger.log({ action: 'handleRoomDeploy.start', roomId })

    // Idempotency: skip if already deployed or deploying
    const room = await this.prisma.room.findUnique({ where: { id: roomId } })
    if (!room || room.status !== 'PENDING') {
      this.logger.log({
        action: 'handleRoomDeploy.skip',
        currentStatus: room?.status,
        roomId,
      })
      return
    }

    // Mark as DEPLOYING to prevent duplicate processing
    await this.prisma.room.update({
      data: { status: 'DEPLOYING' },
      where: { id: roomId },
    })

    try {
      // Resolve image, register task definition, ensure security group
      const imageUri = await this.resolveImageUri()
      const geminiApiKey = process.env.GEMINI_API_KEY || ''
      const taskDefinitionArn = await this.fargate.registerTaskDefinition(imageUri, geminiApiKey)
      const securityGroupId = await this.fargate.ensureSecurityGroup()

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
      await this.prisma.tournament.updateMany({
        data: { status: 'IN_PROGRESS' },
        where: { id: room.tournamentId, status: 'PUBLISHED' },
      })

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

      // Re-throw so the SQS message is NOT deleted and can be retried
      throw error
    }
  }

  private async handleRoomUndeploy(roomId: string): Promise<void> {
    this.logger.log({ action: 'handleRoomUndeploy.start', roomId })

    const room = await this.prisma.room.findUnique({ where: { id: roomId } })
    if (!room || room.status !== 'RUNNING') {
      this.logger.log({
        action: 'handleRoomUndeploy.skip',
        currentStatus: room?.status,
        roomId,
      })
      return
    }

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

      throw error
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
