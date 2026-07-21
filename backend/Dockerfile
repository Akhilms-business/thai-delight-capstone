# --- Build stage ---
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# --- Runtime stage ---
FROM node:18-alpine
WORKDIR /app

# Create a non-root user to run the app (never run containers as root)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Drop privileges
USER appuser

EXPOSE 3000

# Basic container health check (used alongside ALB target group health checks)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
