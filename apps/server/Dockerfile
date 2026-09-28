# ==========================================
# SkyRush Aviator — Production Dockerfile
# For Oracle Cloud Always Free Tier
# ==========================================

# Use Node.js 20 LTS (matches .nvmrc)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies for build
COPY package*.json ./
COPY apps/server/package*.json ./apps/server/
COPY packages/shared/package*.json ./packages/shared/

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build shared package first
RUN npm run build:shared

# Build server
RUN npm run build:server

# Remove dev dependencies for smaller image
RUN npm ci --only=production && npm cache clean --force

# Create uploads directory for legacy support
RUN mkdir -p /app/apps/server/uploads/deposits

# Expose port
EXPOSE 8080

# Set environment to production
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Start the server
CMD ["node", "apps/server/dist/apps/server/src/index.js"]
