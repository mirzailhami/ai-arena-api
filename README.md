# ai-arena-api

Backend service for the AI Arena problem library and tournaments.

## Stack

- TypeScript
- NestJS
- PostgreSQL
- pnpm
- Prisma 7

## API base

The service exposes routes under:

```text
/v6
```

Main route groups:

- `/v6/problem`
- `/v6/tourney`

## Environment

Copy `.env.example` to `.env` and set:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_arena_api?schema=public
PORT=3008
API_PREFIX=v6
LOG_LEVEL=info
AI_ARENA_API_DATA_ROOT=./data
ARENA_SYNTHETICA_WAR_PATH=
```

`AI_ARENA_API_DATA_ROOT` stores uploaded problem ZIPs and extracted test assets.

`ARENA_SYNTHETICA_WAR_PATH` is optional. When set, the file is copied into the Docker build context during problem validation.

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

Run that command from `ai-arena-api/`.

This starts:

- Postgres on `localhost:5432`
- `ai-arena-api` on `localhost:3008`

The compose setup mounts the host Docker socket into `ai-arena-api` so uploaded problems can still be validated with `docker build` / `docker run`.
Problem data is stored in a named Docker volume (`ai-arena-data`) to avoid slow unzip/build I/O on host bind mounts.

## Notes

- Authentication currently only enforces that a request carries either a bearer token or a session header.
- Role-based restriction points are intentionally left as TODO comments per challenge requirements.
- Problem validation requires Docker to be installed and available on the host machine.
