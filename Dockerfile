FROM node:22-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    docker.io \
    unzip \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY tsconfig.build.json ./
COPY nest-cli.json ./
COPY eslint.config.mjs ./
COPY prisma ./prisma

RUN corepack enable
RUN pnpm install

COPY src ./src

EXPOSE 3008

CMD ["pnpm", "start:dev"]
