# Fallback for machines without Node.js:  docker compose up --build
FROM node:24-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NO_OPEN=1 \
    WEB_HOST=0.0.0.0

# Dependencies first so this layer is cached until package files change.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --no-audit --no-fund --include=dev

COPY . .
RUN node scripts/start.mjs --prepare

EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
