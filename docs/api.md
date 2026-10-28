# API

Everything the player does is one API, typed end to end: the procedures are defined once in `packages/orpc`
(Zod schemas for every input and output), the server implements them, and the player calls them through a client typed
from the same definitions.

For your own integrations (a status bar, a stream deck, a script, another app):

- **Reference:** `https://your-player/api`: every procedure with its parameters and responses, and a playground.
- **Spec:** `https://your-player/api/spec.json` (OpenAPI 3), for generating a client in any language.
- **Sign in:** settings → sync → **api token** → make one (a sign-in of its own, listed under settings → account →
  sessions, where you can sign it out). Send it as `Authorization: Bearer <token>`. The terminal's now-playing token
  is not one: it only reaches `/api/remote/*`.

```sh
curl -H "Authorization: Bearer $TOKEN" "https://your-player/api/stats/forgotten?days=90"
```

| path | what |
|---|---|
| `GET /api/version` | the running version |
| `GET /api/stats?from&to&tz` | your listening in a range |
| `GET /api/stats/forgotten?days` | favourites you haven't played in a while |
| `GET /api/mixes?day&hour&tz` | everything made for you right now |
| `GET /api/artists/{id}/appears-on` | albums by others an artist appears on |
| `GET /api/remote/now`, `POST /api/remote/toggle·next·previous` | what's playing, and play/pause/skip ([devices](devices.md)) |

More of the player moves onto the typed API release by release; the reference always lists what's there. Library data
itself (albums, artists, playlists, streams) is Navidrome's own [Subsonic API](https://opensubsonic.netlify.app), which
lodesong proxies at `/rest/*` for its signed-in browsers.
