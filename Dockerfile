# syntax=docker/dockerfile:1
#
# Vaquill for Word - static task-pane host.
# Multi-stage: build the Vite bundle, then serve it from a rootless nginx.
# Security posture is documented in DEPLOY.md.

# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# The ONE project identifier the client needs, injected at build time so it
# stays out of git history. These are NOT secrets: the anon key is public by
# design (Row Level Security protects the data) and both values end up in the
# shipped bundle regardless. The service_role key must NEVER be passed here.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Install from the lockfile for a reproducible build.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Build the production bundle, then strip source maps so they are never shipped.
COPY . .
RUN npm run build \
 && find dist -name '*.map' -delete

# ---- Runtime stage: rootless nginx ----
# nginx-unprivileged runs as uid 101 and listens on 8080 (no root, no
# privileged ports). TLS is terminated upstream by the platform (Traefik).
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Replace the default server with our hardened config.
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Ship only the built static assets.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
