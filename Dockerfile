# Spritpreis Austria — one image, two roles (see docker-compose.yml):
#   web        nginx serving the built site (default command)
#   collector  `node collector/collect.mjs --watch 30` recording prices + summaries
# Both share /usr/share/nginx/html/history through a volume.

# --- build (runs natively on the CI runner, even for other platforms) ----------
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
# Optional street-level photos; Mapillary client tokens are public by design.
ARG VITE_MAPILLARY_TOKEN=""
ENV VITE_MAPILLARY_TOKEN=$VITE_MAPILLARY_TOKEN
RUN npm run build

# --- runtime -----------------------------------------------------------------------
FROM nginx:1.27-alpine
RUN apk add --no-cache nodejs

# Site
COPY --from=build /src/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Collector (built-in Node modules only, no node_modules needed)
WORKDIR /app
COPY package.json ./
COPY collector/collect.mjs collector/rollup.mjs collector/config.json ./collector/
# History recorded so far, used to fill an empty volume on first start.
COPY public/history /app/seed-history

COPY docker/entrypoint.sh /docker-entrypoint.d/05-seed-history.sh
RUN chmod +x /docker-entrypoint.d/05-seed-history.sh

ENV HISTORY_DIR=/usr/share/nginx/html/history TZ=Europe/Vienna
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
