# Multi-stage build: the Home Assistant Supervisor builds this image locally
# on the Pi when the add-on is installed. Stage 1 compiles the React frontend,
# stage 2 assembles the runtime with only production dependencies.

FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
# vite outputs to ../backend/public relative to the frontend dir
RUN mkdir -p /backend && sed -i "s#outDir: '../backend/public'#outDir: '/backend/public'#" vite.config.js \
  && npm run build

FROM node:20-alpine
# python3/make/g++ are needed to compile better-sqlite3 on the target arch;
# tzdata so match times and cron run on Dutch time
RUN apk add --no-cache jq python3 make g++ tzdata
ENV TZ=Europe/Amsterdam NODE_ENV=production

WORKDIR /app
COPY backend/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && apk del python3 make g++

COPY backend/src ./src
COPY --from=frontend /backend/public ./public

COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 8099
CMD ["/run.sh"]
