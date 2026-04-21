# Stage 1: Dependencies
FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Stage 2: Builder
FROM oven/bun:1 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG DATABASE_URL
ARG ADMIN_USERNAME
ARG ADMIN_PASSWORD
ARG ADMIN_NAME
ARG SECRET_KEY

ENV DATABASE_URL=$DATABASE_URL
ENV ADMIN_USERNAME=$ADMIN_USERNAME
ENV ADMIN_PASSWORD=$ADMIN_PASSWORD
ENV ADMIN_NAME=$ADMIN_NAME
ENV SECRET_KEY=$SECRET_KEY

RUN bun run build

# Stage 3: Runner
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Standalone output (pastikan next.config.js punya output: 'standalone')
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"]