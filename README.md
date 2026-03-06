# AI Arena API

**Topcoder Challenge Part 2**: Backend API service for AI competition management - Problem library and tournament bracket orchestration.

Built with **NestJS 10**, **TypeScript 5**, **Prisma 7**, and **PostgreSQL**.

---

## Features

### Problem Library Management
- **Upload & Test**: Upload ZIP files containing AI problems, validate structure, merge with arena base Dockerfile, and run Docker build/test cycles
- **Status Tracking**: Problems track status through lifecycle: `Pending Test` → `Testing` → `Passed`/`Failed`
- **Contest Readiness**: `isContestReady` is set to `true` automatically when a problem passes its Docker test. Per [forum clarification](https://discussions.topcoder.com/discussion/38253/n-x-y-z-values), this flag is "once validated, always validated" — a later failed re-test does **not** revoke it.
- **Build Logs**: Full Docker build and runtime logs stored per problem
- **CRUD Operations**: List, retrieve, and delete problems

### Tournament Bracket Generation
- **Auto-Generation**: Create elimination-style tournament brackets with configurable parameters
- **Flexible Config**: Support for N rounds, X initial entrants, Y max contestants per match, Z advancing per match
- **Problem Assignment**: Assign problems from library to specific contests in tournament brackets
- **Full Bracket API**: Retrieve complete bracket structure with rounds, contests, and entrants

### Authentication & Authorization
- **JWT Validation**: Topcoder Auth0 token validation (HS256/RS256)
- **Global Guard**: All endpoints protected by default (except public routes like health checks)
- **Role Placeholders**: TODO comments indicate where admin/copilot role restrictions should be added

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Runtime** | Node.js | 20.x |
| **Package Manager** | pnpm | 10.23.0 |
| **Framework** | NestJS | 10.4.22 |
| **Language** | TypeScript | 5.9.3 |
| **ORM** | Prisma | 7.4.2 |
| **Database** | PostgreSQL | 16-alpine |
| **Auth** | Passport JWT | 4.x |
| **Validation** | class-validator | 0.14.x |
| **Documentation** | Swagger/OpenAPI | 3.x |
| **Containerization** | Docker | Required |

---

## Prerequisites

1. **Node.js 20.x** - Install via [nvm](https://github.com/nvm-sh/nvm):
   ```bash
   nvm install 20
   nvm use 20
   ```

2. **pnpm 10.23.0** - Install globally:
   ```bash
   npm install -g pnpm@10.23.0
   ```

3. **Docker** - Required for problem testing. Install [Docker Desktop](https://www.docker.com/products/docker-desktop) or Docker Engine.

4. **PostgreSQL** - Either:
   - Use included Docker Compose setup (recommended)
   - Install locally and update `DATABASE_URL` in `.env`

---

## Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/mirzailhami/ai-arena-api
cd ai-arena-api
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Configure Environment (Required)
```bash
cp .env.example .env
```

> **Important**: This step is mandatory. Without a `.env` file, Prisma commands will fail with `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`. The defaults in `.env.example` match the Docker Compose PostgreSQL service, so no edits are needed for local development.

### 4. Start Database
```bash
docker-compose up -d postgres
```

### 5. Run Migrations
```bash
pnpm prisma migrate dev
```

### 6. Generate Prisma Client
```bash
pnpm prisma generate
```

### 7. Start Development Server
```bash
pnpm run start:dev
```

API will be available at **http://localhost:3000/arena-manager/api**

Swagger docs at **http://localhost:3000/api**

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database (PostgreSQL)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_arena?schema=public"

# Server
PORT=3000

# JWT Authentication (Topcoder Auth0 RS256 — keys fetched from JWKS, no secret needed)
JWKS_URI=https://auth.topcoder-dev.com/.well-known/jwks.json
VALID_ISSUERS=https://auth.topcoder-dev.com/
AUTH_SECRET=

# File Storage — relative paths work; adjust to any directory on your machine
PROBLEMS_ROOT="./data/problems"
ARENA_SYNTHETICA_WAR_PATH=""   # optional: absolute path to synthetica2.war

# CORS (for platform-ui integration)
CORS_ORIGINS="https://local.topcoder-dev.com,http://localhost:4200,http://localhost:3000"
```

### Key Paths

- **PROBLEMS_ROOT**: Directory where uploaded problem ZIPs are stored and extracted
- **ARENA_SYNTHETICA_WAR_PATH**: (Optional) Path to synthetica2.war for arena base template

---

## API Endpoints

### Health Check

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/arena-manager/api/health` | Public | Service health status |

### Library (Problem Management)

> Routes match the platform-ui `arena-manager.service.ts` contract (after nginx strips the `/arena-manager/api` prefix).
> Auth: JWT accepted in either `Authorization: Bearer` header or `sessionId` header (platform-ui default).
> Responses: all endpoints return `{ success, data, message }` shape.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/problem/upload` | JWT | Upload ZIP (octet-stream, `X-Problem-Name` header) |
| `POST` | `/problem/test/:id` | JWT | Run Docker test cycle |
| `GET` | `/problem/:id/log` | JWT | Get build/test logs |
| `GET` | `/problem/list` | JWT | List all problems |
| `GET` | `/problem/:id` | JWT | Get single problem |
| `DELETE` | `/problem/:id` | JWT | Delete problem (returns 200 + body) |
| `POST` | `/problem/flag/:id` | JWT | Set/clear `isContestReady` (body: `true`/`false`) |

### Tourney (Tournament Management)

> All routes served under `/arena-manager/api` global prefix, matching the Java
> `TourneyManagerResource` contract (after nginx strips `/arena-manager/api`).
> Response shape: `{ success, data: TourneyResponseDto, message }` where
> `TourneyResponseDto` uses `tourneyId`, `bracketStructure.rounds[].contests[].contestId`.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/tourney/create` | JWT | Create tournament + auto-generate bracket (returns 200) |
| `GET` | `/tourney/list` | JWT | List all tournaments |
| `GET` | `/tourney/:tourneyId` | JWT | Get tournament + full bracket |
| `DELETE` | `/tourney/:tourneyId` | JWT | Delete tournament (returns 200 + body) |
| `PUT` | `/tourney/:tourneyId/round/:roundNumber/contest/:contestId/problem/:problemId` | JWT | Assign problem to contest |

### Swagger Documentation

Full API documentation with request/response schemas available at:

**http://localhost:3000/api** (when server is running)

---

## Development

### Available Scripts

```bash
# Development mode (watch mode)
pnpm run start:dev

# Production mode
pnpm run start:prod

# Build
pnpm run build

# Linting
pnpm run lint
pnpm run lint:fix

# Formatting
pnpm run format

# Prisma commands
pnpm prisma generate      # Generate Prisma Client
pnpm prisma migrate dev   # Create/apply migrations
pnpm prisma studio        # Open Prisma Studio (DB GUI)
```

### Smoke Testing

A self-contained smoke test script covers all endpoints automatically.

**Requirements**: `curl`, `jq`, `zip`, and a valid Topcoder JWT token (see [Getting a JWT token](#getting-a-jwt-token)).

Install `jq` if not already available:
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt install jq

# Windows (Git Bash / WSL)
# WSL: sudo apt install jq
# Or download from https://jqlang.github.io/jq/download/
```

```bash
# Run all smoke tests (will prompt for JWT if not set)
JWT="eyJ..." ./scripts/smoke-test.sh

# Or export once and reuse
export JWT="eyJ..."
./scripts/smoke-test.sh
```

The script will:
- Test public `GET /health` → 200
- Test auth guard with no token → 401
- Upload a minimal test ZIP (binary octet-stream) → 200 with `{ data: { problemId, ... } }`
- Trigger Docker test cycle → 200, check `success` field
- Get build log → 200
- Flag problem as contest-ready → 200
- Create a tournament with a 2-round bracket via `POST /tourney/create` → 200
- Assign problem to contest (path param PUT) → 200
- Delete tournament via `DELETE /tourney/:id` → 200 and verify 404
- Delete problem → 200

> **Docker test note**: Step 4 (Docker test cycle) requires the Docker daemon to be accessible from the running process (`docker ps` must succeed). If Docker is not available, the test is reported as INFO (not a hard failure) and all other tests still run.

#### Getting a JWT token

1. Deploy platform-ui locally (see [Platform-UI Integration](#platform-ui-integration))
2. Log in at `https://local.topcoder-dev.com/` with your Topcoder Dev account
3. Open browser DevTools → **Application** → **Cookies** → copy the `tcjwt` cookie value

Or use `Authorization` header from any authenticated platform-ui network request (DevTools → **Network** tab → any API call → **Request Headers** → `Authorization`).

### Manual API Testing

Use the built-in Swagger UI to test any endpoint interactively:

1. Open **http://localhost:3000/api** in your browser
2. Click **Authorize** (top right), enter `Bearer <your-jwt-token>`
3. Expand any endpoint and click **Try it out**

Example curl commands:

```bash
export JWT="eyJ..."  # your Topcoder JWT
BASE="http://localhost:3000/arena-manager/api"

# Auth: either Authorization: Bearer OR sessionId header (platform-ui default)
AUTH="sessionId: ${JWT}"

# List problems  (returns { success, data: [...], message })
curl -s "${BASE}/problem/list" \
  -H "${AUTH}" | jq

# Upload a problem ZIP (binary octet-stream)
curl -s -X POST "${BASE}/problem/upload" \
  -H "${AUTH}" \
  -H "Content-Type: application/octet-stream" \
  -H "Content-Disposition: attachment; filename=\"my-problem.zip\"" \
  -H "X-Problem-Name: My Problem" \
  --data-binary @/path/to/problem.zip | jq

# Run Docker test cycle
curl -s -X POST "${BASE}/problem/test/<id>" \
  -H "${AUTH}" | jq

# Get build log
curl -s "${BASE}/problem/<id>/log" \
  -H "${AUTH}" | jq

# Flag problem as contest-ready
curl -s -X POST "${BASE}/problem/flag/<id>" \
  -H "${AUTH}" -H "Content-Type: application/json" -d 'true' | jq

# Create tournament  (returns 200 + { data: { tourneyId, bracketStructure, ... } })
curl -s -X POST "${BASE}/tourney/create" \
  -H "${AUTH}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Tourney","numRounds":2,"initialEntrants":8,"maxContestantsPerMatch":4,"advancingContestants":1}' | jq

# List all tournaments
curl -s "${BASE}/tourney/list" \
  -H "${AUTH}" | jq

# Get full bracket (copy contestId from bracketStructure.rounds[].contests[].contestId)
curl -s "${BASE}/tourney/<tourneyId>" \
  -H "${AUTH}" | jq

# Assign problem to contest
curl -s -X PUT "${BASE}/tourney/<tourneyId>/round/1/contest/<contestId>/problem/<problemId>" \
  -H "${AUTH}" | jq

# Delete tournament  (returns 200 + body)
curl -s -X DELETE "${BASE}/tourney/<tourneyId>" \
  -H "${AUTH}" | jq
```

---

## Docker Deployment

### Option 1: Docker Compose (Recommended)

Start all services (PostgreSQL + API):

```bash
docker-compose up -d
```

Services:
- **API**: http://localhost:3000/arena-manager/api
- **PostgreSQL**: localhost:5432
- **Swagger**: http://localhost:3000/api

### Option 2: Docker Only

Build image:
```bash
docker build -t ai-arena-api .
```

Run container:
```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/ai_arena" \
  -e JWKS_URI="https://auth.topcoder-dev.com/.well-known/jwks.json" \
  -e VALID_ISSUERS="https://auth.topcoder-dev.com/" \
  -e PROBLEMS_ROOT="/app/problems" \
  -v $(pwd)/data/problems:/app/problems \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ai-arena-api
```

**Important**: Mount `/var/run/docker.sock` for Docker-in-Docker problem testing.

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] Configure `JWKS_URI` and `VALID_ISSUERS` for production Auth0 tenant
- [ ] Configure `VALID_ISSUERS` for production Auth0
- [ ] Set `NODE_ENV=production`
- [ ] Configure production `DATABASE_URL`
- [ ] Set appropriate `CORS_ORIGINS` for platform-ui
- [ ] Ensure Docker daemon is accessible (for problem testing)
- [ ] Configure persistent volume for `PROBLEMS_ROOT`
- [ ] (Optional) Mount `synthetica2.war` if using arena base template

### Environment-Specific Configuration

**Development**:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_arena"
VALID_ISSUERS="https://topcoder-dev.auth0.com/"
CORS_ORIGINS="http://localhost:4200,https://local.topcoder-dev.com"
```

**Production**:
```bash
DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<db>?ssl=true"
VALID_ISSUERS="https://topcoder.auth0.com/"
CORS_ORIGINS="https://platform-ui.topcoder.com"
```

---

## Platform-UI Integration

This API is designed to work with the Topcoder [platform-ui](https://github.com/topcoder-platform/platform-ui) frontend.

### Local Development Setup

#### 1. Add hosts entry

On your local machine (not inside Docker), add to `/etc/hosts`:
```
127.0.0.1 local.topcoder-dev.com
```

#### 2. Start this API

```bash
docker-compose up -d postgres
pnpm run start:dev   # API on http://localhost:3000/arena-manager/api
```

#### 3. Deploy platform-ui

Follow the [platform-ui README](https://github.com/topcoder-platform/platform-ui) to run it locally. It will be available at `https://local.topcoder-dev.com/`.

#### 4. Log in and extract your JWT

1. Go to `https://local.topcoder-dev.com/` and log in with your **Topcoder Dev** account
2. Open browser DevTools → **Application** → **Cookies** → copy the `tcjwt` cookie value
3. Use that value as your JWT for curl commands and the smoke test script:
   ```bash
   export JWT="<tcjwt-cookie-value>"
   ./scripts/smoke-test.sh
   ```

Alternatively: DevTools → **Network** → any API request → **Request Headers** → copy the `Authorization` header value (without the `Bearer ` prefix).

#### 5. Problem Library page (Part 1 deliverable)

The **Arena Manager → Problem Library** page in platform-ui was delivered in Part 1. If it is deployed, you can upload and test problems through the UI — every request automatically includes the JWT.

> **Note**: There is no tourney UI page in the current platform-ui build. The tourney  
> frontend is a separate deliverable submitted to the platform-ui repo. All tourney  
> API features are tested via curl or the smoke test script.

### CORS Configuration

Ensure `CORS_ORIGINS` in `.env` includes the platform-ui origin:

```bash
CORS_ORIGINS="https://local.topcoder-dev.com,http://localhost:4200"
```

---

## Architecture

### Project Structure

```
ai-arena-api/
├── prisma/
│   ├── schema.prisma          # Database models (Problem, Tournament, Round, Contest)
│   └── migrations/            # Database migration history
├── src/
│   ├── api/                   # Feature modules
│   │   ├── library/           # Problem library feature
│   │   │   ├── dto/           # Request/response DTOs
│   │   │   ├── services/      # Business logic (ZipValidator, DockerTest, etc.)
│   │   │   ├── library.controller.ts
│   │   │   └── library.module.ts
│   │   └── tourney/           # Tournament feature
│   │       ├── dto/
│   │       ├── services/      # BracketGenerator, TourneyService
│   │       ├── tourney.controller.ts
│   │       └── tourney.module.ts
│   ├── config/                # Configuration factory + validation
│   ├── shared/
│   │   └── modules/
│   │       ├── auth/          # JWT strategy, guards, decorators
│   │       └── global/        # PrismaService, global providers
│   ├── app.module.ts          # Root application module
│   └── main.ts                # Bootstrap + Swagger setup
├── .env.example               # Environment template
├── docker-compose.yml         # PostgreSQL + API services
├── Dockerfile                 # Production container image
└── README.md
```

### Database Schema

**Problem** (problems):
- `id` (UUID), `name`, `description`, `status`, `zipFilePath`, `buildLog`
- `isTested`, `isContestReady` (set `true` on first pass, never reverted), `createdAt`, `updatedAt`, `createdBy`

**Tournament** (tournaments):
- `id` (UUID), `name`, `numRounds`, `initialEntrants`, `maxContestantsPerMatch`
- `advancingContestants`, `startDate`, `isActive`, `createdAt`, `createdBy`

**Round** (rounds):
- `id` (UUID), `roundNumber`, `roundName`, `tournamentId` (FK)

**Contest** (contests):
- `id` (UUID), `roundId` (FK), `problemId` (FK), `entrantIds[]`, `winnerId`

---

## Prisma 7 Compatibility Notes

> **For reviewers**: Prisma 7 introduced breaking changes that affect how database connections are configured. This section documents what changed and how it is handled in this project.

### Breaking Change: `url` removed from `schema.prisma`

In Prisma 7, the `url` field inside the `datasource` block of `schema.prisma` is **no longer supported** for runtime connections. Using it produces this error:

```
Error code: P1012
The datasource property `url` is no longer supported in schema files.
Move connection URLs for Migrate to `prisma.config.ts` and pass either
`adapter` for a direct database connection or `accelerateUrl` for Accelerate
to the `PrismaClient` constructor.
```

Official references:
- https://pris.ly/d/config-datasource — configuring the datasource in `prisma.config.ts` for CLI operations (migrations, introspection)
- https://www.prisma.io/docs/orm/core-concepts/supported-databases/database-drivers#driver-adapters — driver adapters for runtime `PrismaClient` connections

### How This Project Handles It

**1. CLI operations** (`prisma migrate`, `prisma generate`, `prisma studio`):  
Configured via `prisma.config.ts` at the project root, using the `env()` helper from `"prisma/config"` (Prisma's type-safe env reader — no `dotenv` workaround needed):

```ts
// prisma.config.ts
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: env("DATABASE_URL") },
});
```

**2. Runtime connections** (`PrismaClient` in the NestJS app):  
`PrismaService` uses `@prisma/adapter-pg` (the official Prisma driver adapter for `pg`) and passes it to the `PrismaClient` constructor:

```ts
// src/shared/modules/global/prisma.service.ts
import { PrismaPg } from '@prisma/adapter-pg';

constructor() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  super({ adapter } as any);
}
```

**3. Environment variable loading order**:  
`PrismaClient` reads `DATABASE_URL` at instantiation time. `@nestjs/config`'s `ConfigModule.forRoot()` calls `dotenv.config()` synchronously during NestJS module registration — before any provider constructor runs — so `process.env.DATABASE_URL` is already populated when the `PrismaPg` adapter is constructed.

---

## Troubleshooting

### Docker Daemon Connection

**Error**: `Cannot connect to Docker daemon`

**Solution**: Ensure Docker is running and `/var/run/docker.sock` is accessible:
```bash
docker ps  # Should list containers without error
```

### Prisma Client Not Generated

**Error**: `@prisma/client` cannot be found

**Solution**: Generate Prisma Client:
```bash
pnpm prisma generate
```

### Prisma Cannot Resolve DATABASE_URL

**Error**: `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`

**Solution**: You need a `.env` file in the project root. Copy the example:
```bash
cp .env.example .env
```
The defaults match the Docker Compose PostgreSQL service — no edits needed for local development.

### Database Connection Refused

**Error**: `P1001: Can't reach database server`

**Solution**: 
1. Check PostgreSQL is running: `docker-compose ps`
2. Verify `DATABASE_URL` in `.env`
3. Ensure database exists: `docker-compose exec postgres psql -U postgres -c "\l"`

### Authentication Failures

**Error**: `401 Unauthorized`

**Solution**:
1. Verify JWT token is valid (not expired)
2. Check `VALID_ISSUERS` matches token issuer
3. Confirm `JWKS_URI` is reachable (`curl $JWKS_URI` should return JSON with `keys`)
4. Check token is sent in `Authorization: Bearer <token>` header (or `sessionId` header)

---

## License

This project is proprietary software developed for Topcoder challenges.

---

## Support

For support, contact Topcoder challenge copilots or post in the challenge forum.

---

## Credits

**Part 1 Java Source**: ai-arena-backend-api (Topcoder Challenge Part 1) — used as reference for porting business logic to NestJS/TypeScript

**Part 2 Implementation**: NestJS/TypeScript port with Prisma 7 + PostgreSQL persistence

**References**: 
- Topcoder projects-api-v6
- Topcoder review-api-v6