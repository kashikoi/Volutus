# Volutus

**The Mac is the sky. Every phone is a cloud.**

Volutus (after *volutus* — the long, tube-shaped roll cloud that tumbles across the sky) is a co-op weather game for
the kashikoi cloud suite. Put the game up on a Mac, scan the QR code with an iPhone, and your phone becomes a cloud
you steer across a shared landscape of lake, farms, forest and town. Hold the button to rain.

It is a plain HTML, CSS, and JavaScript app with no build step, plus one tiny Cloudflare Worker that relays phone
input to the big screen in real time.

## Play

1. Open **https://kashikoi.github.io/Volutus/** on the Mac (full screen with the ⤢ button).
2. Scan the QR code with each phone — or open `kashikoi.github.io/Volutus/play.html` and type the 4-letter room code.
3. **Drag** anywhere on the pad to steer, or tap **Tilt** and steer by tilting the phone. **Hold to rain.**

### Weather

Every cloud carries water (the gauge under its name, and on your phone). Float over the **lake** to soak up more —
mist rises into you, faster the lower you fly. **Raining** drains it and your cloud shrinks; when it's empty it thins
to a wisp and can't rain until it refills. Rain soaks the ground below: soil darkens, fields turn green, puddles
collect — and everything slowly dries out again, so keep it coming.

No phone handy? Press <kbd>K</kbd> on the Mac to fly a cloud with the arrow keys / WASD and Space to rain.

Up to 8 clouds share a sky. If a phone locks or drops, its cloud waits (faded, "away") for 30 seconds before
drifting off; reopening the page picks the same cloud back up.

## Roadmap

- [x] **Milestone 1 — the sky:** rooms, QR pairing, steering by drag or tilt, rain, Day / Twilight / Night / Random.
- [x] **Milestone 2 — weather:** clouds soak up water over the lake, shrink as they rain, and fade when spent; rain wets the ground, which slowly dries.
- [ ] **Milestone 3 — co-op challenges:** "Water the farms before noon", "Put out the forest fire", "Keep the town dry", with a shared score.
- [ ] **Milestone 4 — atmosphere:** wind/rain/thunder sound, and a day → night cycle the host can scrub from a phone.

## How it works

```
iPhone (play.html) ──wss──▶ volutus-relay (Durable Object per room) ──wss──▶ Mac (index.html)
        input {x, y, rain}                 routes only, no game state            simulates + renders
```

- **index.html** (host) owns the world: it simulates every cloud (`js/world.js`) and draws the canvas (`js/render.js`).
- **play.html** (controller) only sends a steering vector and the rain button, ~20 times a second, and only when it changes.
- **relay/** is a Cloudflare Worker with one Durable Object per room code using the WebSocket Hibernation API.
  It forwards player messages to the host and host messages to one player or all, and nothing else.

## Relay

```sh
cd relay
npm install
npx wrangler login      # once
npm run deploy          # → wss://volutus-relay.<your-subdomain>.workers.dev
npm test                # boots wrangler dev and drives it with real WebSocket clients
```

The app defaults to `wss://volutus-relay.nimbus-sync.workers.dev` (`DEFAULT_RELAY` in `js/util.js`). The Workers
free plan includes Durable Objects; each WebSocket message counts as 1/20 of a request, so a few people playing
for an evening is well inside the daily allowance.

## Local development

```sh
(cd relay && npm run dev)                      # relay on ws://<mac-ip>:8787
python3 -m http.server 5173 --bind 0.0.0.0     # app on http://<mac-ip>:5173
```

Open `http://<mac-ip>:5173/index.html?relay=ws://<mac-ip>:8787` on the Mac (use the Mac's LAN IP, not
`localhost`, so the QR code works from the phone). The `relay` override is remembered and passed to phones through
the QR link; `?relay=default` resets it. Over plain `http://` iOS won't expose tilt — drag steering works everywhere.

## Tests

```sh
node --test tests/*.test.js     # world sim, QR encoder, helpers
(cd relay && npm test)          # relay integration
```

## Files

- `index.html`, `play.html`, `styles.css` — host screen, phone pad, shared cloud-suite styles
- `js/util.js` — version, relay URL, ids, theme
- `js/qr.js` — dependency-free QR encoder (byte mode, ECC M, v1–10)
- `js/net.js` — reconnecting WebSocket link
- `js/world.js` — pure simulation (no DOM)
- `js/render.js` — canvas renderer
- `js/host.js`, `js/controller.js` — page wiring
- `relay/` — Cloudflare Worker + Durable Object
