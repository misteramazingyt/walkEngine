#!/bin/sh
set -eu

# Apply any pending migrations against the volume-backed database, then
# start the server. `migrate deploy` is a no-op when already up to date and
# never generates new migrations, so it is safe on every boot.
npx prisma migrate deploy

exec ./node_modules/.bin/next start --hostname 0.0.0.0 --port "${PORT:-3000}"
