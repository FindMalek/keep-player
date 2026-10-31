# Hosted lodesong

Thinking for [#320](https://github.com/FindMalek/lodesong/issues/320). A player at our domain that you point at your own
Navidrome: no docker, the music never leaves your server. Not planned for now; self-hosting stays free and complete.

## Shape

The hosted side keeps accounts, settings, history and mixes, and proxies Subsonic calls. The API devs build on works the
same as on a self-hosted instance.

## Reaching servers behind home networks

| way | works when | catch |
|---|---|---|
| public https url | the server is already exposed | nothing to run, but many people have no public url |
| browser talks to Navidrome directly | the server sends CORS and is reachable from the device | hosted side never sees streams; mixed content and LAN addresses fail from an https page |
| tunnel the user runs (Cloudflare Tunnel, Tailscale funnel, a small agent) | always | one more thing to set up |

Start with public url plus direct-from-browser. It keeps the privacy promise (streams never touch us) and costs nothing.
The proxy is only for Subsonic JSON calls, never audio.

## Privacy

- no audio or cover bytes pass through the hosted side
- server credentials stored encrypted, used only to sign proxied calls
- a self-host export so leaving is one download

## What is paid and what is free

- free: self-hosting, everything in the repo
- paid: hosting, sync, mixes and AI features that cost us money (Groq, AudioMuse analysis), API rate limits for developers

## Open questions

- multi-tenant database layout (per-user SQLite files versus one Postgres)
- abuse: the hosted proxy must only reach the address the user registered (see `docs/security.md` on the allowlist)
