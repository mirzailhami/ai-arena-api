# ai-arena-api

Backend service for the AI Arena — problem library, tournament bracket generation, **publishing engine**, and **AWS Fargate room provisioning**.

## Stack

- TypeScript / NestJS 11
- PostgreSQL / Prisma 7
- pnpm 10
- AWS SDK v3 (ECS, ECR, EC2, CloudWatch Logs, STS, IAM)
- `@nestjs/schedule` (cron-based publishing timer)
- `@nestjs/event-emitter` (internal event bus)

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

## Local run

```bash
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

```bash
docker compose up --build
```

This starts:

- Postgres on `localhost:5432`
- `ai-arena-api` on `localhost:3008`

The compose setup mounts the host Docker socket into `ai-arena-api` so uploaded problems can still be validated with `docker build` / `docker run`.
Problem data is stored in a named Docker volume (`ai-arena-data`) to avoid slow unzip/build I/O on host bind mounts.

## Architecture

```
src/
├── app.module.ts              # Root module (Config, Schedule, EventEmitter, Prisma, etc.)
├── main.ts                    # Bootstrap + Swagger + global prefix
├── common/                    # Shared decorators, pipes
├── prisma/                    # PrismaModule + PrismaService
├── problems/                  # Problem library (upload, test, CRUD)
├── tournaments/               # Tournament CRUD, bracket generation, publish, rooms
├── fargate/                   # AWS Fargate integration
│   ├── fargate.service.ts     # ECS/ECR/EC2 cluster/task/repo management
│   └── image-builder.service.ts # Docker build + ECR push
├── publishing/                # Publishing engine
│   └── publishing-engine.service.ts # Cron scheduler + event handlers
└── shared/                    # Auth guards, JWT strategy
```

### Publishing Engine Flow

1. Admin configures tournament (start date, round duration, intermission) and clicks **Publish**
2. Backend creates `Room` records for every contest, calculating `scheduledAt` and `expiresAt`
3. Cron job runs every minute:
   - Finds PENDING rooms whose `scheduledAt` is within 1 hour → emits `room.deploy`
   - Finds RUNNING rooms past `expiresAt` → emits `room.undeploy`
4. `room.deploy` handler: builds arena Docker image (cached after first build), pushes to ECR, deploys Fargate task, polls for public IP, saves URL
5. `room.undeploy` handler: stops Fargate task, clears room URL
6. When all rooms are STOPPED, tournament is marked COMPLETED

## AWS Setup

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed AWS infrastructure setup instructions.

### Required IAM Permissions

The IAM user needs these managed policies:
- `AmazonECS_FullAccess`
- `AmazonEC2ContainerRegistryFullAccess`
- `AmazonVPCReadOnlyAccess`
- `CloudWatchLogsFullAccess`

The backend auto-creates:
- ECR repository (if not exists)
- ECS cluster (if not exists)
- CloudWatch log group (if not exists)
- ECS task execution role (if not exists)

## Notes

- Authentication currently only enforces that a request carries either a bearer token or a session header.
- Role-based restriction points are intentionally left as TODO comments per challenge requirements.
- Problem validation requires Docker to be installed and available on the host machine.
- Only one tournament can be active (PUBLISHED or IN_PROGRESS) at a time.
- The first arena Docker image build may take several minutes (the image is cached after the initial build). During this time the API may be temporarily unresponsive because the build runs synchronously. Subsequent deployments reuse the cached image and complete quickly.
