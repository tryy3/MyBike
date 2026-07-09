FROM node:26-slim AS base
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY logging/package.json ./logging/
COPY strava-webhook-proxy/package.json ./strava-webhook-proxy/

FROM base AS prod-deps
RUN npm ci --omit=dev --ignore-scripts -w shared -w logging -w strava-webhook-proxy

FROM base AS build
RUN npm ci --ignore-scripts
COPY shared ./shared
COPY logging ./logging
COPY strava-webhook-proxy ./strava-webhook-proxy
RUN npm run -w shared build && npm run -w logging build && npm run -w strava-webhook-proxy build

FROM node:26-slim AS runtime
WORKDIR /app/strava-webhook-proxy
ENV NODE_ENV=production
ENV RUN_MIGRATIONS=true
ENV STRAVA_WEBHOOK_PROXY_DB_PATH=/data/strava-webhook-proxy.db
ENV STRAVA_WEBHOOK_PROXY_PORT=3002

COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package-lock.json /app/
COPY --from=build /app/shared/dist /app/shared/dist
COPY --from=build /app/shared/package.json /app/shared/package.json
COPY --from=build /app/logging/dist /app/logging/dist
COPY --from=build /app/logging/package.json /app/logging/package.json
COPY --from=build /app/strava-webhook-proxy/dist /app/strava-webhook-proxy/dist
COPY --from=build /app/strava-webhook-proxy/package.json /app/strava-webhook-proxy/package.json
COPY --from=build /app/strava-webhook-proxy/drizzle /app/strava-webhook-proxy/drizzle

EXPOSE 3002
CMD ["node", "dist/index.js"]
