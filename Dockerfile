# Root Dockerfile for Render Web Service deployment
FROM node:22-alpine AS build
WORKDIR /app

# Copy dependency manifests and install dependencies
COPY backend/package*.json ./
RUN npm ci

# Copy backend configuration and source
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# Production runner stage
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/v1/health || exit 1

CMD ["node", "dist/server.js"]
