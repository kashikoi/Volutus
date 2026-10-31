const test = require("node:test");
const assert = require("node:assert/strict");
const Wd = require("../js/world.js");

test("players get distinct colors and spread-out spawns", () => {
  const w = Wd.createWorld(1);
  const a = Wd.addPlayer(w, "aaaaaa", "Ann");
  const b = Wd.addPlayer(w, "bbbbbb", "Bob");
  assert.notEqual(a.colorIndex, b.colorIndex);
  assert.ok(Math.abs(a.x - b.x) > 400, "second cloud spawns away from the first");
  for (const p of [a, b]) {
    assert.ok(p.y >= Wd.SKY_TOP && p.y <= Wd.SKY_BOTTOM);
  }
});

test("re-adding an id reconnects the same cloud", () => {
  const w = Wd.createWorld(2);
  const a = Wd.addPlayer(w, "aaaaaa", "Ann");
  Wd.disconnectPlayer(w, "aaaaaa");
  assert.equal(a.connected, false);
  const again = Wd.addPlayer(w, "aaaaaa", "Annie");
  assert.equal(again, a);
  assert.equal(a.connected, true);
  assert.equal(a.name, "Annie");
  assert.equal(w.players.size, 1);
});

test("caps the sky at MAX_PLAYERS", () => {
  const w = Wd.createWorld(3);
  for (let i = 0; i < Wd.MAX_PLAYERS; i++) assert.ok(Wd.addPlayer(w, `p${i}xxxxx`, `P${i}`));
  assert.equal(Wd.addPlayer(w, "extraxx", "X"), null);
  assert.equal(new Set([...w.players.values()].map((p) => p.color)).size, Wd.MAX_PLAYERS);
});

test("input is sanitized to the unit disc", () => {
  assert.deepEqual(Wd.sanitizeInput({ x: 5, y: 0, rain: 1 }), { x: 1, y: 0, rain: true });
  const v = Wd.sanitizeInput({ x: 1, y: 1 });
  assert.ok(Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-9);
  assert.deepEqual(Wd.sanitizeInput({ x: "1", y: NaN }), { x: 0, y: 0, rain: false });
  assert.deepEqual(Wd.sanitizeInput(null), { x: 0, y: 0, rain: false });
});

test("steering moves a cloud and it eases to a stop", () => {
  const w = Wd.createWorld(4);
  const p = Wd.addPlayer(w, "aaaaaa", "Ann");
  p.x = 800;
  const x0 = p.x;
  Wd.setInput(w, "aaaaaa", { x: 1, y: 0 });
  for (let i = 0; i < 30; i++) Wd.step(w, 1 / 60);
  assert.ok(p.x > x0 + 50, "moved right");
  Wd.setInput(w, "aaaaaa", { x: 0, y: 0 });
  for (let i = 0; i < 240; i++) Wd.step(w, 1 / 60);
  assert.ok(Math.abs(p.vx) < 5, "drifted to a stop");
});

test("clouds stay inside the sky", () => {
  const w = Wd.createWorld(5);
  const p = Wd.addPlayer(w, "aaaaaa", "Ann");
  Wd.setInput(w, "aaaaaa", { x: -1, y: 1 });
  for (let i = 0; i < 600; i++) Wd.step(w, 1 / 60);
  assert.ok(p.x >= Wd.CLOUD_HALF_W && p.x < Wd.CLOUD_HALF_W + 5);
  assert.ok(p.y <= Wd.SKY_BOTTOM && p.y > Wd.SKY_BOTTOM - 5);
  Wd.setInput(w, "aaaaaa", { x: 1, y: -1 });
  for (let i = 0; i < 600; i++) Wd.step(w, 1 / 60);
  assert.ok(p.x <= Wd.W - Wd.CLOUD_HALF_W);
  assert.ok(p.y >= Wd.SKY_TOP);
});

test("disconnected clouds linger, then leave after the grace period", () => {
  const w = Wd.createWorld(6);
  Wd.addPlayer(w, "aaaaaa", "Ann");
  Wd.setInput(w, "aaaaaa", { x: 1, y: 0, rain: true });
  Wd.disconnectPlayer(w, "aaaaaa");
  assert.deepEqual(w.players.get("aaaaaa").input, { x: 0, y: 0, rain: false });
  for (let t = 0; t < Wd.DISCONNECT_GRACE - 1; t += 0.1) Wd.step(w, 0.1);
  assert.ok(w.players.has("aaaaaa"));
  for (let t = 0; t < 2; t += 0.1) Wd.step(w, 0.1);
  assert.ok(!w.players.has("aaaaaa"));
});

test("zones cover distinct stretches of ground", () => {
  assert.equal(Wd.zoneAt(250).id, "lake");
  assert.equal(Wd.zoneAt(700).id, "farms");
  assert.equal(Wd.zoneAt(1000).id, "forest");
  assert.equal(Wd.zoneAt(1400).id, "town");
  assert.equal(Wd.zoneAt(20), null);
});

// ---------- Weather ----------
const lakeX = (Wd.ZONES[0].x0 + Wd.ZONES[0].x1) / 2;
const farmsX = (Wd.ZONES[1].x0 + Wd.ZONES[1].x1) / 2;
const run = (w, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 30) Wd.step(w, 1 / 30);
};

test("clouds soak up water over the lake, faster when low", () => {
  const w = Wd.createWorld(7);
  const low = Wd.addPlayer(w, "lowlow", "Low");
  const high = Wd.addPlayer(w, "highhi", "High");
  low.water = high.water = 0.1;
  low.x = high.x = lakeX;
  low.y = Wd.SKY_BOTTOM;
  high.y = Wd.SKY_TOP;
  run(w, 1);
  assert.ok(low.soaking && high.soaking);
  assert.ok(low.water > high.water + 0.05, `low ${low.water} vs high ${high.water}`);
  run(w, 20);
  assert.equal(low.water, 1);
  assert.equal(low.soaking, false, "a full cloud stops soaking");
});

test("no soaking away from the lake", () => {
  const w = Wd.createWorld(8);
  const p = Wd.addPlayer(w, "aaaaaa", "Ann");
  p.x = farmsX;
  run(w, 3);
  assert.equal(p.water, Wd.WATER_START);
  assert.equal(p.soaking, false);
});

test("raining drains water, shrinks the cloud, and wets the ground below", () => {
  const w = Wd.createWorld(9);
  const p = Wd.addPlayer(w, "aaaaaa", "Ann");
  p.x = farmsX;
  const size0 = p.size;
  Wd.setInput(w, "aaaaaa", { rain: true });
  run(w, 2);
  assert.ok(p.raining);
  assert.ok(p.water < Wd.WATER_START - 0.15);
  assert.ok(p.size < size0);
  assert.ok(Wd.wetnessAt(w, farmsX) > 0.5);
  assert.equal(Wd.wetnessAt(w, Wd.ZONES[3].x0 + 50), 0, "the town stays dry");
  assert.ok(Wd.zoneWetness(w, "farms") > 0.1);
  assert.equal(Wd.zoneWetness(w, "town"), 0);
});

test("an empty cloud can't rain until it refills", () => {
  const w = Wd.createWorld(10);
  const p = Wd.addPlayer(w, "aaaaaa", "Ann");
  p.x = farmsX;
  Wd.setInput(w, "aaaaaa", { rain: true });
  run(w, 12);
  assert.ok(p.water <= Wd.EMPTY);
  assert.equal(p.raining, false);
  assert.ok(p.size < Wd.sizeFor(0.1));
  const wet = Wd.wetnessAt(w, farmsX);
  run(w, 1);
  assert.ok(Wd.wetnessAt(w, farmsX) < wet, "ground only dries once the rain stops");
});

test("rain over the lake doesn't count as wet ground", () => {
  const w = Wd.createWorld(11);
  const p = Wd.addPlayer(w, "aaaaaa", "Ann");
  p.x = lakeX;
  Wd.setInput(w, "aaaaaa", { rain: true });
  run(w, 2);
  assert.equal(Wd.zoneWetness(w, "lake"), 0);
});

test("ground dries out over time", () => {
  const w = Wd.createWorld(12);
  w.ground.fill(1);
  run(w, 1 / Wd.DRY_RATE + 1);
  assert.ok(w.ground.every((v) => v === 0));
});
