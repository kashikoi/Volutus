# Volutus — agent context / project memory

Checked-in snapshot of working context for Volutus. If you're an agent picking this up, read this first.

## What this is
- A **co-op multiplayer weather game**: the Mac shows the shared sky (index.html), each iPhone is a controller
  (play.html) that steers one roll cloud and makes it rain. Part of the kashikoi cloud-themed suite (Cumulus,
  Nimbus, Cirrus, Stratus, Anvil, Arcus, Virga, Velum, Pileus). Repo: github.com/kashikoi/Volutus.
  Pages: https://kashikoi.github.io/Volutus/ (served from `main` /).
- Vanilla HTML/CSS/JS, no build step, no external JS dependencies. Themes Day (default) / Twilight / Night / Random.
- Game mode is **co-op** (shared goals, shared score) — chosen by the owner. See README roadmap for milestones.

## Architecture rules (keep these)
- Classic scripts on `window.Volutus`, no ES modules (they don't load from `file://`). Host load order:
  util → qr → net → world → render → host. Controller: util → net → controller.
- **The host is authoritative.** All game state lives in `js/world.js` (pure, no DOM, unit-tested). Phones send
  only input; `world.sanitizeInput` clamps it to the unit disc. Never trust phone-supplied state.
- `js/render.js` reads the world and never mutates it. Rain particles are cosmetic renderer state.
- **The relay only routes.** `relay/src/index.js`: one Durable Object per 4-letter room code
  (`[A-HJ-NP-Z]{4}`, no I/O), Hibernation WebSocket API, tags `host` / `player` / `p:<id>`, per-socket attachment
  `{role, id, name, retired}`. Max 8 players. A new host connection replaces the old one; a player reconnecting with
  the same id replaces their old socket without a `leave`.
- Every server-initiated close is preceded by `{t:"bye", code, reason}` (4001 replaced, 4004 no host, 4009 full,
  4400 bad request) because the close handshake can be slow; `js/net.js` treats these as final (no auto-retry).
- Protocol: player→host `{t:"in", x, y, rain}` arrives as `{t:"msg", from, d}`; relay→host `welcome{players}`,
  `join{id,name}`, `leave{id}`; host→relay `{to: id|"*", d}`; host→player `you{name,color,colorName}`, `full`;
  relay→player `welcome`, `host-left`, `host-back`.
- Logical world is 1600×900 (`HORIZON` 640, clouds fly between `SKY_TOP` and `SKY_BOTTOM`), scaled to fit; the
  backdrop fills letterbox margins. `ZONES` (lake, farms, forest, town) are where future challenges hang.
- Phone ids persist in localStorage `volutus_player_id` so a reload reclaims the same cloud; disconnected clouds
  linger `DISCONNECT_GRACE` (30 s).
- Relay URL: `DEFAULT_RELAY` in `js/util.js`; `?relay=ws://…` overrides (stored in `volutus_relay`, forwarded to
  phones in the QR link), `?relay=default` resets.
- `[hidden] { display:none !important }` is required.

## Testing
- `node --test tests/*.test.js` (world sim, QR encoder, util). The QR encoder was verified bit-for-bit against
  python-qrcode (byte mode, ECC M, all masks, v1–10).
- `cd relay && npm test` boots `wrangler dev` and drives it with real WebSocket clients.
- UI verified with headless Chrome + playwright-core (host + two phone contexts; not checked in).

## Release flow
Work on `develop` → bump `APP_VERSION` in `js/util.js` and every `?v=` in index.html and play.html → run tests →
`rm -rf build && mkdir build && cp -R index.html play.html styles.css icon.svg manifest.webmanifest js build/` →
commit "Release Volutus <version>: <summary>" → push `develop` → `git checkout main && git merge develop -m "Merge develop for Volutus <version>"`
→ push `main` → back to `develop`. Deploy relay changes with `cd relay && npm run deploy`.
