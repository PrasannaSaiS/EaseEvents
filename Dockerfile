# ============================================================
#  EaseEvents — Cloud Run Production Dockerfile
# ============================================================

FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files first (layer cache optimisation)
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy source code
COPY server.js ./

# Cloud Run expects port 8080
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]