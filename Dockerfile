FROM oven/bun:1.4.2-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun scripts/build.ts

FROM alpine:3.22
RUN apk add --no-cache libstdc++ libgcc && adduser -D -H app
COPY --from=build /app/dist/keep-player /usr/local/bin/keep-player
USER app
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["keep-player"]
