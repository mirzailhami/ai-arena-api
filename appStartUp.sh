#!/bin/bash
set -eo pipefail

export DATABASE_URL=$(echo -e ${DATABASE_URL})

echo "Database - running migrations."
npx prisma migrate deploy

# Start the app
pnpm start:prod
