# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

ARG PNPM_VERSION=11
RUN npm i -g pnpm@${PNPM_VERSION} && \
    pnpm config set store-dir ~/.pnpm-store

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# OCI image labels for traceability
ARG COMMIT_SHA
ARG SOURCE_URL
ARG VERSION
ARG LICENSE
ARG AUTHORS

LABEL org.opencontainers.image.revision=${COMMIT_SHA} \
      org.opencontainers.image.source=${SOURCE_URL} \
      org.opencontainers.image.version=${VERSION} \
      org.opencontainers.image.licenses=${LICENSE} \
      org.opencontainers.image.authors=${AUTHORS}

# Copy built output and production dependencies only
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# OpenShift compatibility: allow random UID (root group) to access files
RUN chgrp -R 0 /app && \
    chmod -R g=u /app

USER 1001

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/live || exit 1

CMD ["node", "dist/index.mjs"]
