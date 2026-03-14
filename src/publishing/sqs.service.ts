import { Injectable, OnModuleInit } from '@nestjs/common'
import {
  CreateQueueCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SQSClient,
  SendMessageCommand,
} from '@aws-sdk/client-sqs'

import { LoggerService } from '../shared/modules/global/logger.service'

export interface DeployMessage {
  action: 'DEPLOY'
  roomId: string
}

export interface UndeployMessage {
  action: 'UNDEPLOY'
  roomId: string
}

export type RoomMessage = DeployMessage | UndeployMessage

export interface ReceivedMessage {
  body: RoomMessage
  receiptHandle: string
}

@Injectable()
export class SqsService implements OnModuleInit {
  private readonly logger = LoggerService.forRoot('SqsService')
  private readonly sqs: SQSClient
  private readonly queueName: string
  private readonly dlqName: string
  private queueUrl: string | null = null
  private dlqArn: string | null = null

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1'
    this.sqs = new SQSClient({ region })
    this.queueName = process.env.SQS_QUEUE_NAME || 'ai-arena-deployment'
    this.dlqName = process.env.SQS_DLQ_NAME || 'ai-arena-deployment-dlq'
  }

  async onModuleInit(): Promise<void> {
    await this.ensureQueues()
  }

  /** Creates the DLQ and main queue (with redrive policy) if they don't exist. */
  private async ensureQueues(): Promise<void> {
    this.logger.log({ action: 'ensureQueues.start' })

    // 1. Ensure DLQ exists
    this.dlqArn = await this.ensureQueue(this.dlqName, {
      MessageRetentionPeriod: '1209600', // 14 days
    })

    // 2. Ensure main queue exists with redrive policy pointing to DLQ
    await this.ensureQueue(this.queueName, {
      MessageRetentionPeriod: '86400',    // 1 day
      ReceiveMessageWaitTimeSeconds: '20', // long-polling
      RedrivePolicy: JSON.stringify({
        deadLetterTargetArn: this.dlqArn,
        maxReceiveCount: 3,
      }),
      VisibilityTimeout: '600', // 10 minutes (covers deployment time)
    })

    this.logger.log({ action: 'ensureQueues.complete', dlqArn: this.dlqArn, queueUrl: this.queueUrl })
  }

  /** Creates a queue if it doesn't exist and returns its ARN. Also sets this.queueUrl for the main queue. */
  private async ensureQueue(
    name: string,
    attributes: Record<string, string>,
  ): Promise<string> {
    try {
      const existing = await this.sqs.send(new GetQueueUrlCommand({ QueueName: name }))
      if (existing.QueueUrl) {
        if (name === this.queueName) this.queueUrl = existing.QueueUrl
        const attrs = await this.sqs.send(
          new GetQueueAttributesCommand({
            AttributeNames: ['QueueArn'],
            QueueUrl: existing.QueueUrl,
          }),
        )
        this.logger.log({ action: 'ensureQueue.exists', name })
        return attrs.Attributes?.QueueArn ?? ''
      }
    } catch {
      // Queue doesn't exist, create it
    }

    const created = await this.sqs.send(
      new CreateQueueCommand({ Attributes: attributes, QueueName: name }),
    )
    if (name === this.queueName) this.queueUrl = created.QueueUrl ?? null

    const attrs = await this.sqs.send(
      new GetQueueAttributesCommand({
        AttributeNames: ['QueueArn'],
        QueueUrl: created.QueueUrl!,
      }),
    )
    this.logger.log({ action: 'ensureQueue.created', name })
    return attrs.Attributes?.QueueArn ?? ''
  }

  /** Sends a deployment or undeployment message to the queue. */
  async sendMessage(message: RoomMessage): Promise<void> {
    if (!this.queueUrl) {
      this.logger.error({ action: 'sendMessage.noQueue' })
      return
    }
    await this.sqs.send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(message),
        MessageGroupId: undefined, // standard queue, not FIFO
        QueueUrl: this.queueUrl,
      }),
    )
    this.logger.log({
      action: 'sendMessage.sent',
      messageAction: message.action,
      roomId: message.roomId,
    })
  }

  /** Receives up to 10 messages using long-polling. */
  async receiveMessages(maxMessages = 10): Promise<ReceivedMessage[]> {
    if (!this.queueUrl) return []
    const result = await this.sqs.send(
      new ReceiveMessageCommand({
        MaxNumberOfMessages: maxMessages,
        QueueUrl: this.queueUrl,
        WaitTimeSeconds: 5, // short poll for consumer loop
      }),
    )
    return (result.Messages ?? [])
      .filter((m) => m.Body && m.ReceiptHandle)
      .map((m) => ({
        body: JSON.parse(m.Body!) as RoomMessage,
        receiptHandle: m.ReceiptHandle!,
      }))
  }

  /** Deletes a message after successful processing. */
  async deleteMessage(receiptHandle: string): Promise<void> {
    if (!this.queueUrl) return
    await this.sqs.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    )
  }
}
