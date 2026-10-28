# Builds on the CI's own CPU and cross-compiles the executable for each target (amd64, arm64), so a multi-arch image
# needs no emulation for the slow part.
FROM --platform=$BUILDPLATFORM oven/bun:1.4.2-alpine AS build
ARG TARGETARCH
WORKDIR /app
# The workspace manifests first, so the install layer is cached until a dependency changes.
COPY package.json bun.lock ./
COPY apps/player/package.json apps/player/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY packages/ui/package.json packages/ui/
COPY packages/orpc/package.json packages/orpc/
RUN bun install --frozen-lockfile
COPY . .
RUN BUN_TARGET="bun-linux-$([ "$TARGETARCH" = arm64 ] && echo arm64 || echo x64)-musl" bun scripts/build.ts

FROM alpine:3.22
RUN apk add --no-cache libstdc++ libgcc && adduser -D -H -u 1000 app && mkdir /data && chown app /data
COPY --from=build /app/dist/lodesong /usr/local/bin/lodesong
USER app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
# Sessions, the search and lyrics index, history and the cover cache. Everything else can be read only.
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
LABEL org.opencontainers.image.source="https://github.com/FindMalek/lodesong" \
      org.opencontainers.image.description="A monochrome web player for Navidrome" \
      org.opencontainers.image.licenses="MIT"
CMD ["lodesong"]
