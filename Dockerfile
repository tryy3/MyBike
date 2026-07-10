FROM node:26-bookworm-slim AS base

WORKDIR /app

ENV npm_config_update_notifier=false \
  VITE_GIT_HOOKS=0

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY logging/package.json ./logging/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

FROM base AS prod-deps

RUN npm ci --omit=dev --ignore-scripts

FROM base AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm ci

COPY . .

RUN npm run -w shared build \
  && npm run -w logging build \
  && npm exec -w server -- tsc \
  && npm run -w client build

FROM node:26-bookworm-slim AS runtime

WORKDIR /app/server

ENV NODE_ENV=production \
  PORT=3001 \
  DB_PATH=/data/mybike.db \
  RUN_MIGRATIONS=true

RUN mkdir -p /data && chown node:node /data

COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/
COPY --from=build --chown=node:node /app/shared/package.json /app/shared/package.json
COPY --from=build --chown=node:node /app/shared/dist /app/shared/dist
COPY --from=build --chown=node:node /app/logging/package.json /app/logging/package.json
COPY --from=build --chown=node:node /app/logging/dist /app/logging/dist
COPY --from=build --chown=node:node /app/server/package.json /app/server/package.json
COPY --from=build --chown=node:node /app/server/dist /app/server/dist
COPY --from=build --chown=node:node /app/server/drizzle /app/server/drizzle
COPY --from=build --chown=node:node /app/client/dist /app/client/dist

USER node

EXPOSE 3001

CMD ["node", "dist/index.js"]
