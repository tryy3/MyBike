# syntax=docker/dockerfile:1.7

FROM node:26-bookworm-slim AS build

WORKDIR /app

ENV npm_config_update_notifier=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates g++ make python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

RUN npm ci

COPY . .

RUN npm run -w shared build \
  && npm run -w client build \
  && npm run -w server build \
  && npm prune --omit=dev

FROM node:26-bookworm-slim AS runtime

WORKDIR /app/server

ENV NODE_ENV=production \
  PORT=3001 \
  DB_PATH=/data/mybike.db \
  RUN_MIGRATIONS=true

RUN mkdir -p /data && chown node:node /data

COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/
COPY --from=build --chown=node:node /app/shared/package.json /app/shared/package.json
COPY --from=build --chown=node:node /app/shared/dist /app/shared/dist
COPY --from=build --chown=node:node /app/server/package.json /app/server/package.json
COPY --from=build --chown=node:node /app/server/dist /app/server/dist
COPY --from=build --chown=node:node /app/server/drizzle /app/server/drizzle
COPY --from=build --chown=node:node /app/client/dist /app/client/dist

USER node

EXPOSE 3001

CMD ["node", "dist/index.js"]
