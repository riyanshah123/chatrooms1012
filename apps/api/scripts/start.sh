#!/bin/sh
# Production container entrypoint. Runs on every start (idempotent):
#   1. apply DB migrations
#   2. seed demo content only when the DB is empty (first boot)
#   3. start the API
# This lives here (not a host "pre-deploy" hook) so it works on free tiers
# that don't support pre-deploy commands.
set -e

echo "→ Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

COUNT=$(node -e "const{PrismaClient}=require('@prisma/client');new PrismaClient().prompt.count().then(n=>{console.log(n);process.exit(0)}).catch(()=>{console.log(0);process.exit(0)})")
if [ "$COUNT" = "0" ]; then
  echo "→ Empty database — seeding demo content..."
  ./node_modules/.bin/tsx prisma/seed.ts
else
  echo "→ Database already has $COUNT prompts — skipping seed."
fi

echo "→ Starting API..."
exec node dist/main.js
