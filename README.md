# AI Arena API

**Topcoder Challenge Part 2**: Backend API service for AI competition management - Problem library and tournament bracket orchestration.

Built with **NestJS 10**, **TypeScript 5**, **Prisma 7**, and **PostgreSQL**.

---

## Features

### Problem Library Management
- **Upload & Test**: Upload ZIP files containing AI problems, validate structure, merge with arena base Dockerfile, and run Docker build/test cycles
- **Status Tracking**: Problems track status through lifecycle: `Pending Test` → `Testing` → `Passed`/`Failed`
- **Build Logs**: Full Docker build and runtime logs stored per problem
- **CRUD Operations**: List, retrieve, delete, and flag problems for re-testing

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
git clone <repository-url>
cd ai-arena-api
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your configuration (see Configuration section)
```

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

API will be available at **http://localhost:3000**

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

# JWT Authentication (Topcoder)
AUTH_SECRET="your-secret-key-here"
VALID_ISSUERS="https://topcoder-dev.auth0.com/,https://topcoder.auth0.com/"

# File Storage
PROBLEMS_ROOT="/workspaces/ai-arena-api/problems"
ARENA_SYNTHETICA_WAR_PATH="/workspaces/ai-arena-api/assets/synthetica2.war"

# CORS (for platform-ui integration)
CORS_ORIGINS="http://localhost:4200,http://localhost:3000,https://local.topcoder-dev.com"
```

### Key Paths

- **PROBLEMS_ROOT**: Directory where uploaded problem ZIPs are stored and extracted
- **ARENA_SYNTHETICA_WAR_PATH**: (Optional) Path to synthetica2.war for arena base template

---

## API Endpoints

### Health Check

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | Public | Service health status |

### Library (Problem Management)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/library/upload` | JWT | Upload problem ZIP |
| `POST` | `/library/:id/test` | JWT | Run Docker test cycle |
| `GET` | `/library/:id/log` | JWT | Get build/test logs |
| `GET` | `/library` | JWT | List all problems |
| `GET` | `/library/:id` | JWT | Get single problem |
| `DELETE` | `/library/:id` | JWT | Delete problem |
| `POST` | `/library/:id/flag` | JWT | Flag for re-test |

### Tourney (Tournament Management)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/tourney` | JWT | Create tournament with bracket |
| `GET` | `/tourney` | JWT | List all tournaments |
| `GET` | `/tourney/:id` | JWT | Get tournament + full bracket |
| `PUT` | `/tourney/:id/problem` | JWT | Assign problem to contest |
| `DELETE` | `/tourney/:id` | JWT | Delete tournament |

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

### Testing Problem Upload

1. Create a test problem ZIP with:
   - `Dockerfile` (can be in root or subdirectory)
   - Source code file (e.g., `solution.cpp`, `Solution.java`)

2. Upload via Swagger UI or curl:
   ```bash
   curl -X POST http://localhost:3000/library/upload \
     -H "Authorization: Bearer <jwt-token>" \
     -F "file=@problem.zip"
   ```

3. Trigger test:
   ```bash
   curl -X POST http://localhost:3000/library/<problem-id>/test \
     -H "Authorization: Bearer <jwt-token>"
   ```

4. Check logs:
   ```bash
   curl http://localhost:3000/library/<problem-id>/log \
     -H "Authorization: Bearer <jwt-token>"
   ```

---

## Docker Deployment

### Option 1: Docker Compose (Recommended)

Start all services (PostgreSQL + API):

```bash
docker-compose up -d
```

Services:
- **API**: http://localhost:3000
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
  -e AUTH_SECRET="your-secret" \
  -e VALID_ISSUERS="https://topcoder-dev.auth0.com/" \
  -e PROBLEMS_ROOT="/app/problems" \
  -v $(pwd)/problems:/app/problems \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ai-arena-api
```

**Important**: Mount `/var/run/docker.sock` for Docker-in-Docker problem testing.

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] Set strong `AUTH_SECRET` in environment
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

This API is designed to work with Topcoder platform-ui for frontend.

### Local Development Setup

1. **Host Configuration**: Add to `/etc/hosts`:
   ```
   127.0.0.1 local.topcoder-dev.com
   ```

2. **CORS**: Ensure `CORS_ORIGINS` includes platform-ui URL:
   ```bash
   CORS_ORIGINS="https://local.topcoder-dev.com,http://localhost:4200"
   ```

3. **Authentication Flow**:
   - User logs in via platform-ui → receives JWT from Topcoder Auth0
   - Platform-ui sends JWT in `Authorization: Bearer <token>` header
   - API validates JWT and extracts user info

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
- `isTested`, `isContestReady`, `createdAt`, `updatedAt`, `createdBy`

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
3. Ensure `AUTH_SECRET` matches signing key
4. Check token is sent in `Authorization: Bearer <token>` header

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