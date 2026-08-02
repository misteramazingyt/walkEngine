# MOTIF WALK production image.
#
# SQLite lives on a mounted volume (/data) so projects survive container
# replacement. The entrypoint applies pending Prisma migrations before the
# server starts, so a fresh volume boots straight into a working app.
#
#   docker build -t motif-walk .
#   docker run -p 3000:3000 -v motif-walk-data:/data motif-walk
#
# Two stages: the builder carries a C/C++ toolchain because better-sqlite3
# falls back to compiling from source when its prebuilt binary can't be
# fetched (observed on Fly.io's Depot builders); the runtime stage ships
# without the toolchain.

FROM node:22-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The build needs a DATABASE_URL to exist but never touches the real volume.
RUN DATABASE_URL="file:/tmp/build.db" npx prisma generate \
  && DATABASE_URL="file:/tmp/build.db" npm run build


FROM node:22-slim

WORKDIR /app

# ca-certificates for outbound HTTPS (Wikipedia/Wikidata from Phase 2 on).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Same base image as the builder, so the compiled native modules inside
# node_modules are binary-compatible.
COPY --from=builder /app ./

ENV NODE_ENV=production
ENV DATABASE_URL="file:/data/motif-walk.db"
ENV PORT=3000

VOLUME /data
EXPOSE 3000

CMD ["./docker-entrypoint.sh"]
