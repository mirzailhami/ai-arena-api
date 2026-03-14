import { Injectable } from '@nestjs/common'
import {
  CreateServiceCommand,
  DeleteServiceCommand,
  DescribeServicesCommand,
  DescribeTasksCommand,
  ECSClient,
  ListTasksCommand,
  RegisterTaskDefinitionCommand,
  UpdateServiceCommand,
} from '@aws-sdk/client-ecs'
import {
  CreateRepositoryCommand,
  DescribeRepositoriesCommand,
  ECRClient,
  GetAuthorizationTokenCommand,
} from '@aws-sdk/client-ecr'
import {
  CreateClusterCommand,
  DescribeClustersCommand,
} from '@aws-sdk/client-ecs'
import {
  CreateLogGroupCommand,
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import {
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
} from '@aws-sdk/client-ec2'

import { LoggerService } from '../shared/modules/global/logger.service'

export interface DeployResult {
  taskArn: string
  publicIp: string | null
  url: string | null
}

@Injectable()
export class FargateService {
  private readonly logger = LoggerService.forRoot('FargateService')
  private readonly ecs: ECSClient
  private readonly ecr: ECRClient
  private readonly ec2: EC2Client
  private readonly logs: CloudWatchLogsClient
  private readonly region: string
  private readonly clusterName: string
  private readonly taskFamily: string
  private readonly repoName: string
  private readonly containerPort: number

  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1'
    this.clusterName = process.env.ECS_CLUSTER_NAME || 'ai-arena-cluster'
    this.taskFamily = process.env.ECS_TASK_FAMILY || 'ai-arena-room'
    this.repoName = process.env.ECR_REPOSITORY_NAME || 'ai-arena'
    this.containerPort = Number(process.env.CONTAINER_PORT) || 8080

    const config = { region: this.region }
    this.ecs = new ECSClient(config)
    this.ecr = new ECRClient(config)
    this.ec2 = new EC2Client(config)
    this.logs = new CloudWatchLogsClient(config)
  }

  /** Ensures the ECR repository exists, creates it if not. */
  async ensureEcrRepository(): Promise<string> {
    this.logger.log({ action: 'ensureEcrRepository.start', repo: this.repoName })
    try {
      const desc = await this.ecr.send(
        new DescribeRepositoriesCommand({ repositoryNames: [this.repoName] }),
      )
      const uri = desc.repositories?.[0]?.repositoryUri
      if (uri) {
        this.logger.log({ action: 'ensureEcrRepository.exists', uri })
        return uri
      }
    } catch {
      // Repository doesn't exist, create it
    }

    const result = await this.ecr.send(
      new CreateRepositoryCommand({ repositoryName: this.repoName }),
    )
    const uri = result.repository?.repositoryUri ?? ''
    this.logger.log({ action: 'ensureEcrRepository.created', uri })
    return uri
  }

  /** Gets ECR login credentials for Docker push. */
  async getEcrAuthToken(): Promise<{ endpoint: string; token: string }> {
    this.logger.log({ action: 'getEcrAuthToken.start' })
    const result = await this.ecr.send(new GetAuthorizationTokenCommand({}))
    const authData = result.authorizationData?.[0]
    if (!authData?.authorizationToken || !authData.proxyEndpoint) {
      throw new Error('Failed to get ECR authorization token')
    }
    this.logger.log({ action: 'getEcrAuthToken.success', endpoint: authData.proxyEndpoint })
    return {
      endpoint: authData.proxyEndpoint,
      token: authData.authorizationToken,
    }
  }

  /** Ensures the ECS cluster exists, creates it if not. */
  async ensureCluster(): Promise<void> {
    this.logger.log({ action: 'ensureCluster.start', cluster: this.clusterName })
    try {
      const desc = await this.ecs.send(
        new DescribeClustersCommand({ clusters: [this.clusterName] }),
      )
      const active = desc.clusters?.find((c) => c.status === 'ACTIVE')
      if (active) {
        this.logger.log({ action: 'ensureCluster.exists' })
        return
      }
    } catch {
      // Cluster doesn't exist
    }

    await this.ecs.send(
      new CreateClusterCommand({ clusterName: this.clusterName }),
    )
    this.logger.log({ action: 'ensureCluster.created' })
  }

  /** Ensures the CloudWatch log group exists. */
  async ensureLogGroup(): Promise<void> {
    const logGroupName = `/ecs/${this.taskFamily}`
    try {
      const desc = await this.logs.send(
        new DescribeLogGroupsCommand({ logGroupNamePrefix: logGroupName }),
      )
      if (desc.logGroups?.some((lg) => lg.logGroupName === logGroupName)) {
        return
      }
    } catch {
      // Doesn't exist
    }
    await this.logs.send(new CreateLogGroupCommand({ logGroupName }))
    this.logger.log({ action: 'ensureLogGroup.created', logGroupName })
  }

  /** Gets default VPC subnet IDs for Fargate tasks. */
  async getDefaultSubnets(): Promise<string[]> {
    this.logger.log({ action: 'getDefaultSubnets.start' })
    const vpcs = await this.ec2.send(
      new DescribeVpcsCommand({ Filters: [{ Name: 'isDefault', Values: ['true'] }] }),
    )
    const vpcId = vpcs.Vpcs?.[0]?.VpcId
    if (!vpcId) {
      throw new Error('No default VPC found. Create one in the AWS console.')
    }

    const subnets = await this.ec2.send(
      new DescribeSubnetsCommand({
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
      }),
    )
    const subnetIds = subnets.Subnets?.map((s) => s.SubnetId).filter(Boolean) as string[]
    if (!subnetIds.length) {
      throw new Error('No subnets found in default VPC.')
    }
    this.logger.log({ action: 'getDefaultSubnets.found', count: subnetIds.length, vpcId })
    return subnetIds
  }

  /** Ensures a security group exists that allows inbound traffic on the container port. */
  async ensureSecurityGroup(): Promise<string> {
    const sgName = 'ai-arena-fargate-sg'
    const { DescribeSecurityGroupsCommand, CreateSecurityGroupCommand, AuthorizeSecurityGroupIngressCommand } =
      await import('@aws-sdk/client-ec2')

    try {
      const existing = await this.ec2.send(
        new DescribeSecurityGroupsCommand({
          Filters: [{ Name: 'group-name', Values: [sgName] }],
        }),
      )
      const sg = existing.SecurityGroups?.[0]
      if (sg?.GroupId) {
        this.logger.log({ action: 'ensureSecurityGroup.exists', sgId: sg.GroupId })
        return sg.GroupId
      }
    } catch {
      // Doesn't exist
    }

    // Get default VPC ID
    const vpcs = await this.ec2.send(
      new DescribeVpcsCommand({ Filters: [{ Name: 'isDefault', Values: ['true'] }] }),
    )
    const vpcId = vpcs.Vpcs?.[0]?.VpcId
    if (!vpcId) {
      throw new Error('No default VPC found.')
    }

    const created = await this.ec2.send(
      new CreateSecurityGroupCommand({
        Description: 'Security group for AI Arena Fargate tasks',
        GroupName: sgName,
        VpcId: vpcId,
      }),
    )
    const sgId = created.GroupId!

    await this.ec2.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: sgId,
        IpPermissions: [
          {
            FromPort: this.containerPort,
            IpProtocol: 'tcp',
            IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'Arena container port' }],
            ToPort: this.containerPort,
          },
        ],
      }),
    )

    this.logger.log({ action: 'ensureSecurityGroup.created', sgId })
    return sgId
  }

  /**
   * Registers a Fargate task definition for the arena container.
   * Call this once before deploying multiple rooms to avoid concurrent
   * RegisterTaskDefinition requests which cause ECS throttling.
   */
  async registerTaskDefinition(
    imageUri: string,
    geminiApiKey: string,
  ): Promise<string> {
    this.logger.log({ action: 'registerTaskDefinition.start', imageUri })

    await this.ensureCluster()
    await this.ensureLogGroup()

    const taskDef = await this.ecs.send(
      new RegisterTaskDefinitionCommand({
        containerDefinitions: [
          {
            essential: true,
            environment: [
              { name: 'GEMINI_API_KEY', value: geminiApiKey },
              { name: 'ARENA_DATA_ROOT', value: '/var/lib/arena' },
            ],
            image: imageUri,
            logConfiguration: {
              logDriver: 'awslogs',
              options: {
                'awslogs-group': `/ecs/${this.taskFamily}`,
                'awslogs-region': this.region,
                'awslogs-stream-prefix': this.taskFamily,
              },
            },
            name: 'arena-container',
            portMappings: [
              {
                containerPort: this.containerPort,
                hostPort: this.containerPort,
                protocol: 'tcp',
              },
            ],
          },
        ],
        cpu: '256',
        executionRoleArn: await this.getOrCreateExecutionRoleArn(),
        family: this.taskFamily,
        memory: '512',
        networkMode: 'awsvpc',
        requiresCompatibilities: ['FARGATE'],
      }),
    )

    const taskDefinitionArn = taskDef.taskDefinition?.taskDefinitionArn
    if (!taskDefinitionArn) {
      throw new Error('Failed to register task definition')
    }
    this.logger.log({ action: 'registerTaskDefinition.success', taskDefinitionArn })
    return taskDefinitionArn
  }

  /**
   * Deploys a container to Fargate for a specific room.
   * Returns the public URL pointing to arena.html.
   */
  async deployRoom(
    roomId: string,
    taskDefinitionArn: string,
    securityGroupId: string,
  ): Promise<DeployResult> {
    this.logger.log({ action: 'deployRoom.start', roomId, taskDefinitionArn })
    const serviceName = `arena-room-${roomId.slice(0, 8)}`

    const subnets = await this.getDefaultSubnets()

    // Create ECS service with public IP
    await this.ecs.send(
      new CreateServiceCommand({
        cluster: this.clusterName,
        desiredCount: 1,
        launchType: 'FARGATE',
        networkConfiguration: {
          awsvpcConfiguration: {
            assignPublicIp: 'ENABLED',
            securityGroups: [securityGroupId],
            subnets,
          },
        },
        serviceName,
        taskDefinition: taskDefinitionArn,
      }),
    )

    this.logger.log({ action: 'deployRoom.serviceCreated', serviceName })

    // Wait for the task to get a public IP
    const publicIp = await this.waitForPublicIp(serviceName)
    const url = publicIp
      ? `http://${publicIp}:${this.containerPort}/vibe-coder-poc/arena.html`
      : null

    const taskArn = await this.getServiceTaskArn(serviceName)

    this.logger.log({ action: 'deployRoom.finish', publicIp, roomId, url })
    return { publicIp, taskArn: taskArn ?? serviceName, url }
  }

  /** Stops and removes a Fargate service for a room. */
  async undeployRoom(roomId: string): Promise<void> {
    const serviceName = `arena-room-${roomId.slice(0, 8)}`
    this.logger.log({ action: 'undeployRoom.start', roomId, serviceName })

    try {
      // Scale down to 0
      await this.ecs.send(
        new UpdateServiceCommand({
          cluster: this.clusterName,
          desiredCount: 0,
          service: serviceName,
        }),
      )

      // Delete the service
      await this.ecs.send(
        new DeleteServiceCommand({
          cluster: this.clusterName,
          force: true,
          service: serviceName,
        }),
      )

      this.logger.log({ action: 'undeployRoom.finish', serviceName })
    } catch (error) {
      this.logger.warn({
        action: 'undeployRoom.error',
        error: error instanceof Error ? error.message : String(error),
        serviceName,
      })
      throw error
    }
  }

  /** Polls for the public IP of a Fargate task within a service. */
  private async waitForPublicIp(
    serviceName: string,
    maxAttempts = 30,
    delayMs = 10000,
  ): Promise<string | null> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      this.logger.debug({
        action: 'waitForPublicIp.poll',
        attempt,
        serviceName,
      })

      const taskArn = await this.getServiceTaskArn(serviceName)
      if (taskArn) {
        const desc = await this.ecs.send(
          new DescribeTasksCommand({
            cluster: this.clusterName,
            tasks: [taskArn],
          }),
        )
        const eni = desc.tasks?.[0]?.attachments
          ?.find((a) => a.type === 'ElasticNetworkInterface')
          ?.details?.find((d) => d.name === 'networkInterfaceId')

        if (eni?.value) {
          const { DescribeNetworkInterfacesCommand } = await import(
            '@aws-sdk/client-ec2'
          )
          const nic = await this.ec2.send(
            new DescribeNetworkInterfacesCommand({
              NetworkInterfaceIds: [eni.value],
            }),
          )
          const ip =
            nic.NetworkInterfaces?.[0]?.Association?.PublicIp ?? null
          if (ip) return ip
        }
      }

      await this.delay(delayMs)
    }
    this.logger.warn({
      action: 'waitForPublicIp.timeout',
      maxAttempts,
      serviceName,
    })
    return null
  }

  /** Gets the first task ARN for a given service. */
  private async getServiceTaskArn(
    serviceName: string,
  ): Promise<string | null> {
    const tasks = await this.ecs.send(
      new ListTasksCommand({
        cluster: this.clusterName,
        serviceName,
      }),
    )
    return tasks.taskArns?.[0] ?? null
  }

  /**
   * Gets the ecsTaskExecutionRole ARN.
   * Tries IAM GetRole first; falls back to constructing the ARN from the account ID.
   * The role must exist (create it manually or via IaC if missing).
   */
  private async getOrCreateExecutionRoleArn(): Promise<string> {
    const roleName = 'ecsTaskExecutionRole'

    try {
      const { IAMClient, GetRoleCommand } = await import('@aws-sdk/client-iam')
      const iam = new IAMClient({ region: this.region })
      const existing = await iam.send(new GetRoleCommand({ RoleName: roleName }))
      if (existing.Role?.Arn) {
        this.logger.log({ action: 'getOrCreateExecutionRole.exists', arn: existing.Role.Arn })
        return existing.Role.Arn
      }
    } catch {
      // IAM permission may not be available; fall back to constructing the ARN
    }

    const accountId = await this.getAccountId()
    const arn = `arn:aws:iam::${accountId}:role/${roleName}`
    this.logger.log({ action: 'getOrCreateExecutionRole.fallbackArn', arn })
    return arn
  }

  private async getAccountId(): Promise<string> {
    this.logger.log({ action: 'getAccountId.start' })
    const { STSClient, GetCallerIdentityCommand } = await import(
      '@aws-sdk/client-sts'
    )
    const sts = new STSClient({ region: this.region })
    const identity = await sts.send(new GetCallerIdentityCommand({}))
    this.logger.log({ action: 'getAccountId.success', account: identity.Account })
    return identity.Account ?? ''
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
