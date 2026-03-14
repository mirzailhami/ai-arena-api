# Deployment Guide

Step-by-step guide for setting up the AI Arena backend with AWS Fargate room provisioning.

---

## Prerequisites

1. **Node.js 20.x** and **pnpm 10.x**
2. **Docker** installed and running (for building arena container images)
3. **PostgreSQL 16** (local or via Docker Compose)
4. **AWS account** (free tier is sufficient for Fargate Spot)
5. **Topcoder Dev account** (for JWT authentication)

---

## 1. AWS Account Setup

### 1.1 Create an IAM User

1. Log in to [AWS Console](https://console.aws.amazon.com/)
2. Navigate to **IAM → Users → Create user**
3. Name: `ai-arena-deployer` (or any name)
4. Attach these managed policies:
   - `AmazonECS_FullAccess`
   - `AmazonEC2ContainerRegistryFullAccess`
   - `AmazonVPCReadOnlyAccess`
   - `CloudWatchLogsFullAccess`
   - `AmazonSQSFullAccess`
   - `AmazonEventBridgeSchedulerFullAccess` *(optional — only needed if using EventBridge Scheduler)*
5. Additionally, ensure the user has `sts:GetCallerIdentity` permission (included in most default policies)
6. Create an **Access Key** (CLI use case)
6. Save the Access Key ID and Secret Access Key

### 1.2 Verify Default VPC

The backend deploys Fargate tasks into the default VPC's public subnets. Verify you have one:

```bash
aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId"
```

If no default VPC exists, create one:
```bash
aws ec2 create-default-vpc
```

### 1.3 Create ECS Task Execution Role

The IAM deployer user typically lacks `iam:CreateRole` permissions, so this role must be created manually:

1. Navigate to **IAM → Roles → Create role**
2. Trusted entity type: **AWS service**
3. Use case: **Elastic Container Service → Elastic Container Service Task**
4. Role name: `ecsTaskExecutionRole`
5. Attach managed policy: `AmazonECSTaskExecutionRolePolicy`
6. Create the role

The trust policy should allow `ecs-tasks.amazonaws.com` to assume the role (this is set automatically when choosing the ECS Task use case above).

### 1.4 EventBridge Scheduler Role (Optional)

If using EventBridge Scheduler for precise room deployment triggers:

1. Navigate to **IAM → Roles → Create role**
2. Trusted entity type: **AWS service**
3. Use case: **EventBridge Scheduler**
4. Role name: `ai-arena-scheduler-role`
5. Create an inline policy allowing `sqs:SendMessage` on the deployment queue:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": "sqs:SendMessage",
       "Resource": "arn:aws:sqs:us-east-1:<account-id>:ai-arena-deployment"
     }]
   }
   ```
6. Copy the Role ARN into `.env` as `SCHEDULER_ROLE_ARN`
7. Copy the SQS queue ARN into `.env` as `SQS_QUEUE_ARN`

> **Note:** EventBridge Scheduler is optional. Without it, the reconciliation cron (every 5 min) handles all deployments.

### 1.5 Auto-Created Resources

The backend automatically creates these AWS resources on first use:
- **ECR Repository** (`ai-arena`) — stores the arena Docker image
- **ECS Cluster** (`ai-arena-cluster`) — runs Fargate tasks
- **CloudWatch Log Group** (`/ecs/ai-arena-room`) — collects container logs
- **Security Group** (`ai-arena-fargate-sg`) — allows inbound traffic on port 8080
- **SQS Queue** (`ai-arena-deployment`) — deployment message queue
- **SQS Dead Letter Queue** (`ai-arena-deployment-dlq`) — failed deployment messages (retained 14 days)

---

## 2. Backend Setup

### 2.1 Install Dependencies

```bash
cd ai-arena-api
pnpm install
```

### 2.2 Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_arena_api?schema=public"

# Server
PORT=3008
API_PREFIX=v6
LOG_LEVEL=info

# File storage
AI_ARENA_API_DATA_ROOT="./data"

# AWS credentials (from step 1.1)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-access-key-id>
AWS_SECRET_ACCESS_KEY=<your-secret-access-key>

# ECS/ECR naming
ECR_REPOSITORY_NAME=ai-arena
ECS_CLUSTER_NAME=ai-arena-cluster
ECS_TASK_FAMILY=ai-arena-room
CONTAINER_PORT=8080

# Arena container environment
GEMINI_API_KEY=           # optional — passed to arena containers

# Path to the ai-arena-develop folder (contains Dockerfile for arena WAR)
ARENA_SOURCE_DIR=/path/to/ai-arena-develop/ai-arena-develop

# SQS Deployment Queue (auto-created if not exists)
SQS_QUEUE_NAME=ai-arena-deployment
SQS_DLQ_NAME=ai-arena-deployment-dlq

# EventBridge Scheduler (optional — cron reconciliation covers if unset)
SQS_QUEUE_ARN=
SCHEDULER_ROLE_ARN=
```

### 2.3 Start Database

```bash
docker compose up -d postgres
```

### 2.4 Run Migrations

```bash
pnpm prisma:migrate:dev
```

### 2.5 Generate Prisma Client

```bash
pnpm prisma:generate
```

### 2.6 Start the Server

```bash
pnpm start:dev
```

The API is now available at `http://localhost:3008/v6`.

---

## 3. Frontend Setup

### 3.1 Apply Patches

Apply the platform-ui patches from Challenges 1 and 2, then apply the C3 patch:

```bash
cd platform-ui
git apply c3-platform-ui.patch
```

### 3.2 Configure API Endpoint

In the arena-manager service config, ensure the backend URL points to:
```
http://localhost:3008/v6
```

### 3.3 Start Frontend

Follow the standard platform-ui setup:
```bash
yarn install
yarn dev
```

Access at `https://local.topcoder-dev.com/arena-manager/ai-hub`

---

## 4. End-to-End Smoke Test

### 4.1 Upload Problems

1. Navigate to **Problem Library** page
2. Upload 3 problem ZIP files (e.g., 774830.zip, 774840.zip, 775021.zip)
3. Run Docker tests for each — wait for `Passed` status
4. Problems automatically become contest-ready on pass

### 4.2 Create Tournament

1. Navigate to **Tournaments** page
2. Create a new tournament:
   - Name: "Test Tournament"
   - Rounds: 2
   - Initial Entrants: 8
   - Max per Match: 4
   - Advancing: 1
3. Assign problems to contests
4. Configure scheduling:
   - Start Date/Time (set to ~65 minutes from now for quick testing)
   - Round Duration: 60 minutes
   - Intermission: 15 minutes
5. Click **Publish**

### 4.3 Verify Fargate Deployment

1. The publishing engine deploys rooms via SQS messages (triggered by EventBridge Scheduler or reconciliation cron every 5 min)
2. Rooms are deployed 1 hour before their `scheduledAt` time
3. Monitor backend logs for deployment events:
   ```
   [PublishingEngine] Deploying room <roomId>...
   [PublishingEngine] Room <roomId> deployed at http://<ip>:8080/vibe-coder-poc/arena.html
   ```
4. Navigate to **AI Hub** page — room links appear when containers are running
5. Click a room link to verify the arena page loads

### 4.4 Verify Room Entry

1. Click an active room link in the AI Hub
2. The arena page should load at `http://<fargate-ip>:8080/vibe-coder-poc/arena.html`
3. Register/submit a prompt to verify connectivity

---

## 5. Troubleshooting

### Container won't start

- Check CloudWatch logs: AWS Console → CloudWatch → Log groups → `/ecs/ai-arena-room`
- Verify the arena Docker image builds locally: `docker build -t ai-arena <ARENA_SOURCE_DIR>`
- If the arena container needs a Gemini key, ensure `GEMINI_API_KEY` is set in `.env`

### No public IP assigned

- Fargate tasks need `assignPublicIp: ENABLED` (the backend sets this automatically)
- Verify the subnets are in a **public** VPC with an Internet Gateway
- The backend polls for a public IP for up to 5 minutes after task launch

### Room links not appearing in AI Hub

- Check that the tournament status is `PUBLISHED` or `IN_PROGRESS`
- Verify the SQS consumer is running (look for `[PublishingEngine]` log entries)
- Check the reconciliation cron is running (logs every 5 minutes)
- Room links only appear when `status = RUNNING` and `url` is set

### ECR authentication fails

- Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set correctly
- Ensure the IAM user has `AmazonEC2ContainerRegistryFullAccess`
- Check that Docker is running (needed for `docker login` to ECR)

### Database migration issues

- Ensure `.env` file exists with `DATABASE_URL` set
- Run `pnpm prisma:migrate:dev` to apply pending migrations
- If schema is out of sync: `pnpm prisma:generate` to regenerate the client

---

## 6. Architecture Notes

### Security Model

- All API endpoints are JWT-protected (Topcoder Auth0 tokens)
- AWS credentials are stored in `.env` only (gitignored)
- Fargate tasks run in public subnets with a dedicated security group (`ai-arena-fargate-sg`) allowing inbound on port 8080
- The task execution role has minimal permissions (ECR pull + CloudWatch logs)

### Cost Considerations

- Fargate tasks are automatically stopped when rooms expire
- ECR images are cached after first build
- All resources are in a single region to minimize data transfer costs
- On AWS free tier: 750 hours/month of Fargate (Linux, ARM or x86)
- SQS: 1 million free requests/month (well within arena usage)
- EventBridge Scheduler: 14 million free invocations/month
