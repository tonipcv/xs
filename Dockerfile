# Multi-stage build for production Next.js app

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
# Install full deps (including dev) to support building in the next stage
# Do not run postinstall scripts here (Prisma) because schema isn't copied yet
RUN npm ci --ignore-scripts

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Reuse node_modules from deps for faster and consistent builds
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js app
# Build-time envs (safe dummies) to avoid module-load checks crashing build
ENV NEXT_TELEMETRY_DISABLED=1 \
    STRIPE_SECRET_KEY=sk_test_dummy \
    STRIPE_WEBHOOK_SECRET=whsec_dummy \
    NEXTAUTH_SECRET=build_dummy
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
