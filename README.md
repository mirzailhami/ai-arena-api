# ai-arena-api

Backend service for the AI Arena — problem library, tournament bracket generation, **publishing engine**, and **AWS Fargate room provisioning**.

## Stack

- TypeScript / NestJS 11
- PostgreSQL / Prisma 7
- pnpm 10
- AWS SDK v3 (ECS, ECR, EC2, CloudWatch Logs, STS, IAM, SQS, EventBridge Scheduler)
- `@nestjs/schedule` (reconciliation cron)
- Amazon SQS (reliable deployment message queue with DLQ)
- Amazon EventBridge Scheduler (precise one-time room deployment triggers)

## API base

The service exposes routes under:

```text
/v6
```

Main route groups:

- `/v6/problem` — Problem library CRUD, upload, Docker test
- `/v6/tourney` — Tournament CRUD, bracket generation, publish, rooms, active hub

## New C3 Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v6/tourney/:tourneyId/publish` | Publish a DRAFT tournament — creates rooms, starts scheduling |
| `GET` | `/v6/tourney/:tourneyId/rooms` | List rooms for a tournament |
| `GET` | `/v6/tourney/active/hub` | Get the active tournament with all room data (for AI Hub) |

## Environment

Copy `.env.example` to `.env` and set:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_arena_api?schema=public
PORT=3008
API_PREFIX=v6
LOG_LEVEL=info
AI_ARENA_API_DATA_ROOT=./data
ARENA_SYNTHETICA_WAR_PATH=

# AWS credentials
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>

# ECS / ECR / Fargate
ECR_REPOSITORY_NAME=ai-arena
ECS_CLUSTER_NAME=ai-arena-cluster
ECS_TASK_FAMILY=ai-arena-room
CONTAINER_PORT=8080

# Arena container config
GEMINI_API_KEY=<your-gemini-key>
ARENA_SOURCE_DIR=<path-to-ai-arena-develop-folder>

# SQS Deployment Queue (auto-created if not exists)
SQS_QUEUE_NAME=ai-arena-deployment
SQS_DLQ_NAME=ai-arena-deployment-dlq

# EventBridge Scheduler (optional — cron reconciliation covers if unset)
SQS_QUEUE_ARN=
SCHEDULER_ROLE_ARN=
```

### Key variables

| Variable | Purpose |
|----------|---------|
| `AWS_REGION` | AWS region for Fargate deployment (default: `us-east-1`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | IAM credentials with ECS, ECR, EC2, CloudWatch permissions |
| `ECR_REPOSITORY_NAME` | ECR repo name for arena Docker images |
| `ECS_CLUSTER_NAME` | ECS cluster name for running Fargate tasks |
| `CONTAINER_PORT` | Port exposed by the arena container (default: `8080`) |
| `GEMINI_API_KEY` | *(Optional)* API key passed to arena containers as env var |
| `ARENA_SOURCE_DIR` | Path to the `ai-arena-develop` folder containing `Dockerfile` and arena source |
| `SQS_QUEUE_NAME` | SQS deployment queue name (default: `ai-arena-deployment`, auto-created) |
| `SQS_DLQ_NAME` | SQS dead-letter queue name (default: `ai-arena-deployment-dlq`, auto-created) |
| `SQS_QUEUE_ARN` | *(Optional)* SQS queue ARN for EventBridge Scheduler target |
| `SCHEDULER_ROLE_ARN` | *(Optional)* IAM role ARN for EventBridge Scheduler to send SQS messages |

## Local run

Before starting, ensure `ARENA_SOURCE_DIR` points to a real folder containing `Dockerfile`.

```bash
ls "$ARENA_SOURCE_DIR"/Dockerfile
pnpm install
pnpm prisma:generate
pnpm prisma:migrate:dev
pnpm start:dev
```

The frontend local override in `platform-ui` expects the service at:

```text
http://localhost:3008/v6
```

## Docker Compose

For local review with bundled Postgres:

1. In `.env`, set `ARENA_SOURCE_DIR` to the **absolute path** of the folder containing the arena `Dockerfile`.
2. Run compose:

```bash
docker compose up --build
```

This starts:

- Postgres on `localhost:5432`
- `ai-arena-api` on `localhost:3008`

Compose mounts `ARENA_SOURCE_DIR` into the container at the same path, so the same value works for both local and Docker runs.

The compose setup mounts the host Docker socket into `ai-arena-api` so uploaded problems can still be validated with `docker build` / `docker run`.
Problem data is stored in a named Docker volume (`ai-arena-data`) to avoid slow unzip/build I/O on host bind mounts.

## Architecture

```
src/
├── app.module.ts              # Root module (Config, Schedule, Prisma, etc.)
├── main.ts                    # Bootstrap + Swagger + global prefix
├── common/                    # Shared decorators, pipes
├── prisma/                    # PrismaModule + PrismaService
├── problems/                  # Problem library (upload, test, CRUD)
├── tournaments/               # Tournament CRUD, bracket generation, publish, rooms
├── fargate/                   # AWS Fargate integration
│   ├── fargate.service.ts     # ECS/ECR/EC2 cluster/task/repo management
│   └── image-builder.service.ts # Docker build + ECR push
├── publishing/                # Publishing engine
│   ├── publishing-engine.service.ts # SQS consumer + reconciliation cron
│   ├── sqs.service.ts         # SQS queue management (deployment queue + DLQ)
│   └── scheduler.service.ts   # EventBridge Scheduler (one-time deployment triggers)
└── shared/                    # Auth guards, JWT strategy
```

### Publishing Engine Flow

1. Admin configures tournament (start date, round duration, intermission) and clicks **Publish**
2. Backend creates `Room` records for every contest, calculating `scheduledAt` and `expiresAt`
3. **EventBridge Scheduler** creates a one-time schedule per room, firing at `scheduledAt – 1 hour`
4. When the schedule fires, it sends a `DEPLOY` message to the **SQS deployment queue**
5. **SQS consumer** (polling every 10s) picks up the message and deploys the room:
   - Builds arena Docker image (cached after first build), pushes to ECR
   - Deploys Fargate task, polls for public IP, saves URL
   - On success: deletes the SQS message
   - On failure: message returns to queue after visibility timeout (3 retries → DLQ)
6. **Reconciliation cron** (every 5 min) catches any rooms missed by EventBridge/SQS
7. Expired RUNNING rooms receive `UNDEPLOY` messages → Fargate tasks are stopped
8. When all rooms are STOPPED/FAILED, tournament is marked COMPLETED

## AWS Setup

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed AWS infrastructure setup instructions.

### Required IAM Permissions

The IAM user needs these managed policies:
- `AmazonECS_FullAccess`
- `AmazonEC2ContainerRegistryFullAccess`
- `AmazonVPCReadOnlyAccess`
- `CloudWatchLogsFullAccess`
- `AmazonSQSFullAccess`
- `AmazonEventBridgeSchedulerFullAccess` *(optional — only needed if using EventBridge Scheduler)*

The backend auto-creates:
- ECR repository (if not exists)
- ECS cluster (if not exists)
- CloudWatch log group (if not exists)
- SQS deployment queue with Dead Letter Queue (if not exists)

**Manual setup required:**
- ECS task execution role (`ecsTaskExecutionRole`) — must be created manually in IAM Console (trusted entity: ECS Tasks, attach `AmazonECSTaskExecutionRolePolicy`)

## Smoke Test

An automated end-to-end smoke test script is included. It creates tournaments, assigns problems, publishes, verifies rooms, tests the AI Hub endpoint, and validates error handling (409/404).

### Prerequisites

- API running (`pnpm start:dev`)
- PostgreSQL running (`docker compose up -d postgres`)
- At least 1 problem uploaded and flagged as contest-ready

### Reset DB (optional — keeps problems)

```bash
docker exec ai-arena-postgres psql -U postgres -d ai_arena_api \
  -c "DELETE FROM rooms; DELETE FROM tournaments;"
```

### Run

```bash
bash scripts/smoke-test.sh
```

The script prints pass/fail for each check and a summary at the end. After completion, the SQS-based publishing engine will deploy rooms to AWS Fargate (triggered by EventBridge Scheduler or reconciliation cron). Monitor with:

```bash
curl -s http://localhost:3008/v6/tourney/<tourneyId>/rooms \
  -H 'Authorization: Bearer test' | python3 -m json.tool
```

Rooms transition: `PENDING` → `DEPLOYING` → `RUNNING` (with public URL) → `STOPPED`.

## Notes

- Authentication currently only enforces that a request carries either a bearer token or a session header.
- Role-based restriction points are intentionally left as TODO comments per challenge requirements.
- Problem validation requires Docker to be installed and available on the host machine.
- Only one tournament can be active (PUBLISHED or IN_PROGRESS) at a time.
- The first arena Docker image build may take several minutes (the image is cached after the initial build). During this time the API may be temporarily unresponsive because the build runs synchronously. Subsequent deployments reuse the cached image and complete quickly.
