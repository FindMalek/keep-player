# A Navidrome with the generated demo library baked in (docs/demo-library.md), for PR previews and screenshots.
# Build from the repo root: docker build -f infra/demo/Dockerfile -t keep-player-demo .
FROM oven/bun:1.4.2-alpine AS library
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY scripts/demo-library.ts scripts/
COPY scripts/demo scripts/demo
RUN bun scripts/demo-library.ts /music --seconds 20

FROM deluan/navidrome:0.64.2
COPY --from=library /music /music
ENV ND_MUSICFOLDER=/music \
    ND_DATAFOLDER=/data \
    ND_SCANSCHEDULE=@every 24h \
    ND_AUTOIMPORTPLAYLISTS=true \
    ND_COVERARTPRIORITY="cover.*, embedded" \
    ND_ENABLESHARING=false \
    ND_LOGLEVEL=warn
