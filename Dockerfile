# syntax=docker/dockerfile:1

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Standard Node build (no Vercel-exclusive features). Produces .next/standalone.
RUN npm run build

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone server + static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Drizzle migrations are applied at boot (see src/db/index.ts)
COPY --from=builder /app/drizzle ./drizzle

# Writable dir for local fallbacks (PGlite / auth secret / local image storage)
# when Supabase env vars are not provided.
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
