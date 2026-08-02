# MOTIF WALK production image.
#
# SQLite lives on a mounted volume (/data) so projects survive container
# replacement. The entrypoint applies pending Prisma migrations before the
# server starts, so a fresh volume boots straight into a working app.
#
#   docker build -t motif-walk .
#   docker run -p 3000:3000 -v motif-walk-data:/data motif-walk
#
# Single-stage on purpose: the standalone-output optimization is documented
# in PLAN.md as a follow-up; this trades image size for a build with no
# dependency-tracing edge cases around the native SQLite driver.

FROM node:22-slim

WORKDIR /app

# better-sqlite3 ships prebuilt binaries for this platform; no toolchain
# needed. ca-certificates is required for outbound HTTPS (Wikipedia/Wikidata
# from Phase 2 on).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The build needs a DATABASE_URL to exist but never touches the real volume.
RUN DATABASE_URL="file:/tmp/build.db" npx prisma generate \
  && DATABASE_URL="file:/tmp/build.db" npm run build

ENV NODE_ENV=production
ENV DATABASE_URL="file:/data/motif-walk.db"
ENV PORT=3000

VOLUME /data
EXPOSE 3000

CMD ["./docker-entrypoint.sh"]
