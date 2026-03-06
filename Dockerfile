# AI Arena API - NestJS Application
# Multi-stage build for optimized production image

# Stage 1: Build
FROM node:20-alpine AS builder

# Install pnpm globally
RUN npm install -g pnpm@10.23.0

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma Client
RUN pnpm prisma generate

# Build application
RUN pnpm run build

# Stage 2: Production
FROM node:20-alpine AS production

# Install pnpm globally
RUN npm install -g pnpm@10.23.0

# Install Docker CLI for problem testing
RUN apk add --no-cache docker-cli

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Create directories for problem storage
RUN mkdir -p /app/problems

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/arena-manager/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Copy startup script
COPY appStartUp.sh ./
RUN chmod +x appStartUp.sh

# Start application (runs prisma migrate deploy then starts server)
CMD ["./appStartUp.sh"]
