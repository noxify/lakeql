# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

ARG PNPM_VERSION=12
RUN npm i -g pnpm@${PNPM_VERSION} && \
    pnpm config set store-dir ~/.pnpm-store

# Install dependencies (full, incl. dev deps needed for the build)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build

# Drop dev dependencies from node_modules in-place, leaving only the
# production dependency closure to copy into the runner stage.
RUN pnpm prune --prod

# Production stage
#
# This uses the official node:24-alpine image as a sensible, debuggable base.
# For a stricter security posture in production, consider a hardened/distroless
# base such as `gcr.io/distroless/nodejs24-debian12` or a Chainguard Node image
# — both shrink the attack surface, but drop the shell and package manager
# (adjust the HEALTHCHECK, which relies on `wget`, accordingly).
#
# Whichever base you use, rebuild with `docker build --pull` regularly so the
# base image picks up the latest security patches.
FROM node:24-alpine AS runner

# Patch OS packages (OpenSSL, zlib, busybox, …) to the latest available fixes
# at build time, then drop the apk cache to keep the image small.
RUN apk upgrade --no-cache

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

# Copy built output and the pruned, production-only dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Remove the bundled npm/npx (not needed at runtime; drops npm's bundled
# undici and shrinks the attack surface). The app starts with `node` directly.
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx

# OpenShift compatibility: allow random UID (root group) to access files
RUN chgrp -R 0 /app && \
    chmod -R g=u /app

USER 1001

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4000/live || exit 1

CMD ["node", "dist/index.mjs"]
