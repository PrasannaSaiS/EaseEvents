# ============================================================
#  EaseEvents — Cloud Run Production Dockerfile (Optimized)
# ============================================================

FROM node:18-alpine AS production

# Set production environment
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Copy package files first (layer cache optimisation)
COPY package*.json ./

# Install production dependencies only (clean install for deterministic builds)
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source
COPY server.js ./
COPY config ./config
COPY lib ./lib
COPY public ./public

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Cloud Run expects port 8080
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]