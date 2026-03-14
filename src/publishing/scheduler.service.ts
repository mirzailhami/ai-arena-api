import { Injectable } from '@nestjs/common'
import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  FlexibleTimeWindowMode,
  SchedulerClient,
} from '@aws-sdk/client-scheduler'

import { LoggerService } from '../shared/modules/global/logger.service'

/**
 * Manages EventBridge one-time schedules for room deployments.
 *
 * When a tournament is published, a schedule is created per room that fires
 * at `scheduledAt – 1 hour`. The target is the SQS deployment queue,
 * delivering a JSON deploy message that the SQS consumer processes.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = LoggerService.forRoot('SchedulerService')
  private readonly scheduler: SchedulerClient
  private readonly roleArn: string
  private readonly sqsArn: string

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1'
    this.scheduler = new SchedulerClient({ region })
    this.roleArn = process.env.SCHEDULER_ROLE_ARN || ''
    this.sqsArn = process.env.SQS_QUEUE_ARN || ''
  }

  /**
   * Creates a one-time EventBridge schedule that sends a DEPLOY message
   * to SQS at `fireAt` (typically scheduledAt – 1 hour).
   */
  async scheduleRoomDeployment(
    roomId: string,
    fireAt: Date,
  ): Promise<void> {
    const scheduleName = `arena-deploy-${roomId.slice(0, 8)}`

    // If the fire time is in the past or within the next 2 minutes, skip scheduler
    // The cron reconciliation job will catch it
    const now = new Date()
    if (fireAt.getTime() <= now.getTime() + 2 * 60 * 1000) {
      this.logger.log({
        action: 'scheduleRoomDeployment.imminent',
        fireAt: fireAt.toISOString(),
        roomId,
      })
      return
    }

    if (!this.roleArn || !this.sqsArn) {
      this.logger.warn({
        action: 'scheduleRoomDeployment.missingConfig',
        message: 'SCHEDULER_ROLE_ARN or SQS_QUEUE_ARN not set, skipping EventBridge schedule',
        roomId,
      })
      return
    }

    try {
      await this.scheduler.send(
        new CreateScheduleCommand({
          ActionAfterCompletion: 'DELETE',
          FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF },
          Name: scheduleName,
          ScheduleExpression: `at(${fireAt.toISOString().replace(/\.\d{3}Z$/, '')})`,
          Target: {
            Arn: this.sqsArn,
            Input: JSON.stringify({ action: 'DEPLOY', roomId }),
            RoleArn: this.roleArn,
          },
        }),
      )
      this.logger.log({
        action: 'scheduleRoomDeployment.created',
        fireAt: fireAt.toISOString(),
        roomId,
        scheduleName,
      })
    } catch (error) {
      // Non-fatal: cron reconciliation will catch it
      this.logger.warn({
        action: 'scheduleRoomDeployment.failed',
        error: error instanceof Error ? error.message : String(error),
        roomId,
      })
    }
  }

  /** Deletes a schedule (e.g., when a tournament is deleted before deployment). */
  async cancelRoomDeployment(roomId: string): Promise<void> {
    const scheduleName = `arena-deploy-${roomId.slice(0, 8)}`
    try {
      await this.scheduler.send(
        new DeleteScheduleCommand({ Name: scheduleName }),
      )
      this.logger.log({
        action: 'cancelRoomDeployment.deleted',
        roomId,
        scheduleName,
      })
    } catch {
      // Schedule may not exist or already fired — acceptable
    }
  }
}
