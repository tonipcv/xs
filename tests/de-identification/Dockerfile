# Multi-stage build for production-ready Docker image
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm install -g typescript

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build || tsc

# Production image
FROM node:18-alpine

# Install security updates
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S xase && \
    adduser -S -u 1001 -G xase xase

WORKDIR /app

# Copy built files and dependencies from builder
COPY --from=builder --chown=xase:xase /app/node_modules ./node_modules
COPY --from=builder --chown=xase:xase /app/dist ./dist
COPY --chown=xase:xase package*.json ./

# Create necessary directories
RUN mkdir -p /app/data /app/output /app/logs && \
    chown -R xase:xase /app

# Switch to non-root user
USER xase

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start API server
CMD ["node", "dist/api-server.js"]
