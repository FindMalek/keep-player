# The site (landing page, docs) as Next's standalone server. Build from the repo root:
# docker build -f apps/web/Dockerfile .
FROM oven/bun:1.4.2-alpine AS build
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
RUN cd apps/web && NEXT_TELEMETRY_DISABLED=1 bun run build

FROM oven/bun:1.4.2-alpine
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER bun
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
LABEL org.opencontainers.image.source="https://github.com/FindMalek/keep-player" \
      org.opencontainers.image.description="keep music's site: the landing page and docs" \
      org.opencontainers.image.licenses="MIT"
CMD ["bun", "apps/web/server.js"]
