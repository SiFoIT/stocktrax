# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:22-alpine AS runner

WORKDIR /app

# Install build tools, production deps, then clean up
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && \
    npm install drizzle-kit@^0.31.8 && \
    apk del python3 make g++

# Copy build output and required files
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/tsconfig.json ./

# Copy DB schema and drizzle config for migrations
COPY --from=builder /app/src/lib/db/ ./src/lib/db/
COPY --from=builder /app/drizzle.config.ts ./

# Copy entrypoint
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Create data directory for SQLite volume mount
RUN mkdir -p data

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
