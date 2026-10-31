/* Volutus — world simulation. Pure logic (no DOM) so it can run under node --test.
   The Mac host owns the world; phones only send input. Coordinates are logical 1600×900. */
(function (root) {
  "use strict";

  const W = 1600;
  const H = 900;
  const HORIZON = 640;
  const SKY_TOP = 90;
  const SKY_BOTTOM = 470;
  const CLOUD_HALF_W = 110;
  const MAX_SPEED = 430;
  const RESPONSE = 2.6;
  const DISCONNECT_GRACE = 30;
  const MAX_PLAYERS = 8;

  const COLORS = [
    { name: "Coral", hex: "#ff8a7a" },
    { name: "Sky", hex: "#6cbcff" },
    { name: "Mint", hex: "#5ee0a8" },
    { name: "Lilac", hex: "#b99bff" },
    { name: "Gold", hex: "#ffd24a" },
    { name: "Peach", hex: "#ffae6b" },
    { name: "Teal", hex: "#3fd6c8" },
    { name: "Rose", hex: "#ff8fcf" },
  ];

  // Landmarks along the ground; later milestones hang challenges off these.
  const ZONES = [
    { id: "lake", label: "Lake", x0: 110, x1: 430 },
    { id: "farms", label: "Farms", x0: 480, x1: 900 },
    { id: "forest", label: "Forest", x0: 940, x1: 1210 },
    { id: "town", label: "Town", x0: 1250, x1: 1540 },
  ];

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 100000) / 100000;
    };
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function createWorld(seed = Date.now()) {
    const rand = rng(seed);
    const ambient = [];
    for (let i = 0; i < 7; i++) {
      ambient.push({
        x: rand() * (W + 400) - 200,
        y: 40 + rand() * 300,
        scale: 0.5 + rand() * 0.8,
        speed: 6 + rand() * 14,
        seed: Math.floor(rand() * 1e9),
      });
    }
    return { t: 0, seed, players: new Map(), ambient, rand };
  }

  function pickColor(world) {
    const used = new Set([...world.players.values()].map((p) => p.colorIndex));
    for (let i = 0; i < COLORS.length; i++) if (!used.has(i)) return i;
    return world.players.size % COLORS.length;
  }

  function spawnX(world) {
    const others = [...world.players.values()].map((p) => p.x);
    let best = W / 2;
    let bestGap = -1;
    for (let i = 0; i < 24; i++) {
      const x = CLOUD_HALF_W + ((W - 2 * CLOUD_HALF_W) * (i + 0.5)) / 24;
      const gap = others.length ? Math.min(...others.map((o) => Math.abs(o - x))) : W - Math.abs(x - W / 2);
      if (gap > bestGap) {
        bestGap = gap;
        best = x;
      }
    }
    return best;
  }

  function addPlayer(world, id, name) {
    const existing = world.players.get(id);
    if (existing) {
      existing.name = name || existing.name;
      existing.connected = true;
      existing.goneFor = 0;
      return existing;
    }
    if (world.players.size >= MAX_PLAYERS) return null;
    const colorIndex = pickColor(world);
    const player = {
      id,
      name: name || "Cloud",
      colorIndex,
      color: COLORS[colorIndex].hex,
      colorName: COLORS[colorIndex].name,
      x: spawnX(world),
      y: SKY_TOP + 60 + world.rand() * (SKY_BOTTOM - SKY_TOP - 120),
      vx: 0,
      vy: 0,
      roll: world.rand() * Math.PI * 2,
      input: { x: 0, y: 0, rain: false },
      connected: true,
      goneFor: 0,
      joinedAt: world.t,
      seed: Math.floor(world.rand() * 1e9),
    };
    world.players.set(id, player);
    return player;
  }

  function disconnectPlayer(world, id) {
    const p = world.players.get(id);
    if (!p) return;
    p.connected = false;
    p.input = { x: 0, y: 0, rain: false };
  }

  function sanitizeInput(raw) {
    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, -1, 1) : 0);
    let x = num(raw && raw.x);
    let y = num(raw && raw.y);
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    return { x, y, rain: Boolean(raw && raw.rain) };
  }

  function setInput(world, id, raw) {
    const p = world.players.get(id);
    if (!p) return false;
    p.input = sanitizeInput(raw);
    return true;
  }

  function step(world, dtRaw) {
    const dt = clamp(dtRaw, 0, 0.1);
    world.t += dt;
    const k = Math.min(1, RESPONSE * dt);

    for (const p of [...world.players.values()]) {
      if (!p.connected) {
        p.goneFor += dt;
        if (p.goneFor > DISCONNECT_GRACE) {
          world.players.delete(p.id);
          continue;
        }
      }
      p.vx += (p.input.x * MAX_SPEED - p.vx) * k;
      p.vy += (p.input.y * MAX_SPEED * 0.7 - p.vy) * k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < CLOUD_HALF_W || p.x > W - CLOUD_HALF_W) {
        p.x = clamp(p.x, CLOUD_HALF_W, W - CLOUD_HALF_W);
        p.vx *= -0.3;
      }
      if (p.y < SKY_TOP || p.y > SKY_BOTTOM) {
        p.y = clamp(p.y, SKY_TOP, SKY_BOTTOM);
        p.vy *= -0.3;
      }
      // A roll cloud tumbles about its long axis as it moves.
      p.roll += (p.vx / 60 + 0.25) * dt;
    }

    for (const a of world.ambient) {
      a.x += a.speed * dt;
      if (a.x > W + 250) a.x = -250;
    }
  }

  function zoneAt(x) {
    return ZONES.find((z) => x >= z.x0 && x <= z.x1) || null;
  }

  const api = {
    W,
    H,
    HORIZON,
    SKY_TOP,
    SKY_BOTTOM,
    CLOUD_HALF_W,
    MAX_PLAYERS,
    DISCONNECT_GRACE,
    COLORS,
    ZONES,
    rng,
    createWorld,
    addPlayer,
    disconnectPlayer,
    setInput,
    sanitizeInput,
    step,
    zoneAt,
  };
  root.Volutus = root.Volutus || {};
  root.Volutus.world = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
