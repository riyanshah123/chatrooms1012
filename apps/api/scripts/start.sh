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

# Seed is idempotent: it creates missing prompts and refreshes the copy
# (description/tags/category) on existing ones, so running it every deploy
# keeps content current without duplicating anything.
echo "Seeding/refreshing content..."
./node_modules/.bin/tsx prisma/seed.ts || echo "seed failed (continuing)"

echo "→ Starting API..."
exec node dist/main.js
