# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

RUN ls -la dist/ && echo "---" && find dist/ -name "*.js" | head -20

# Stage 2: Production stage
FROM node:20-alpine

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production --force && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy swagger documentation
COPY --from=builder --chown=nodejs:nodejs /app/src/swagger ./src/swagger

# Copy migrations
COPY --from=builder --chown=nodejs:nodejs /app/src/migration ./src/migration

# Copy .env file if exists (better to use environment variables in production)
COPY --from=builder --chown=nodejs:nodejs /app/.env* ./

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 7000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7000/api-docs', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Start the application
CMD ["node", "dist/index.js"]