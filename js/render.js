/* Volutus — canvas renderer for the shared sky on the Mac. Reads world state; never mutates it. */
(function (root) {
  "use strict";

  const V = root.Volutus;
  const { W, H, HORIZON, ZONES, rng } = V.world;

  const PALETTES = {
    day: {
      skyTop: "#3b82d6", skyMid: "#7dbcef", skyHorizon: "#d8eefb",
      sun: "#fff7d1", sunGlow: "rgba(255, 244, 200, 0.55)",
      ridgeFar: "#8eaecb", ridgeNear: "#7ba487", ground: "#79a85a", groundDeep: "#5d8d46",
      lake: "#4d9edb", lakeLit: "#b4def8", fields: ["#a3c96c", "#d1bd62", "#86b95c", "#c3d27f", "#b9a35a"],
      tree: "#2f6b3a", treeDark: "#1f4f2a", trunk: "#5b4330",
      wall: "#f3e7d3", wallShade: "#d9c7ab", roof: "#c4574a", roofDark: "#97403a", window: "#6d8aa6", windowGlow: 0,
      cloudLit: "#ffffff", cloudMid: "#edf3fb", cloudShade: "#b4c3d9", ambientAlpha: 0.85,
      shadow: "rgba(18, 48, 24, 0.20)", rain: "rgba(150, 190, 240, 0.85)", stars: 0,
      tagBg: "rgba(255, 255, 255, 0.82)", tagInk: "#0f172a",
    },
    twilight: {
      skyTop: "#251f52", skyMid: "#8a4c8c", skyHorizon: "#ffb27a",
      sun: "#ffcf8f", sunGlow: "rgba(255, 170, 110, 0.55)",
      ridgeFar: "#5d4878", ridgeNear: "#4a4a6a", ground: "#4d5947", groundDeep: "#3a4538",
      lake: "#7a6aa6", lakeLit: "#ffc49a", fields: ["#6b6a4c", "#82684a", "#5f6a48", "#76704e", "#6d5c48"],
      tree: "#2b3a33", treeDark: "#1d2924", trunk: "#3a2e2a",
      wall: "#c9a9a0", wallShade: "#9f8288", roof: "#7a3d4a", roofDark: "#5a2c3a", window: "#ffd28a", windowGlow: 0.6,
      cloudLit: "#ffd9c4", cloudMid: "#e3a9bb", cloudShade: "#7a6a9c", ambientAlpha: 0.75,
      shadow: "rgba(20, 10, 40, 0.22)", rain: "rgba(220, 190, 240, 0.8)", stars: 0.35,
      tagBg: "rgba(40, 30, 70, 0.75)", tagInk: "#fbf7ff",
    },
    night: {
      skyTop: "#040814", skyMid: "#0c1730", skyHorizon: "#22355c",
      sun: "#f2f5ff", sunGlow: "rgba(190, 210, 255, 0.25)",
      ridgeFar: "#14213a", ridgeNear: "#101c2c", ground: "#15251b", groundDeep: "#0d1912",
      lake: "#1d3760", lakeLit: "#6f8fc4", fields: ["#1c2d1d", "#2a2a1d", "#1a2a1a", "#23301f", "#2a2620"],
      tree: "#0c1c12", treeDark: "#07120b", trunk: "#1a1410",
      wall: "#3a3f52", wallShade: "#2a2e3e", roof: "#1d2030", roofDark: "#14161f", window: "#ffd27a", windowGlow: 1,
      cloudLit: "#9aa9cc", cloudMid: "#5e6f96", cloudShade: "#273352", ambientAlpha: 0.55,
      shadow: "rgba(0, 0, 0, 0.25)", rain: "rgba(150, 170, 220, 0.7)", stars: 0.9,
      tagBg: "rgba(10, 16, 32, 0.78)", tagInk: "#f1f5f9",
    },
  };

  function buildScenery() {
    const rand = rng(42);
    const ridge = [];
    for (let x = -600; x <= W + 600; x += 40) ridge.push([x, 548 + Math.sin(x / 210) * 22 + Math.sin(x / 77) * 9 + rand() * 10]);
    const hills = [];
    for (let x = -600; x <= W + 600; x += 40) hills.push([x, 612 + Math.sin(x / 160 + 1.3) * 14 + rand() * 6]);

    const farms = ZONES.find((z) => z.id === "farms");
    const fields = [];
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const y0 = 662 + r * 28;
      let x = farms.x0 + r * 6;
      while (x < farms.x1 - 20) {
        const w = 60 + rand() * 70;
        fields.push({ x, y: y0, w: Math.min(w, farms.x1 - x), h: 26, c: Math.floor(rand() * 5), rows: rand() > 0.4 });
        x += w + 4;
      }
    }

    const forest = ZONES.find((z) => z.id === "forest");
    const trees = [];
    for (let i = 0; i < 46; i++) {
      trees.push({ x: forest.x0 + 10 + rand() * (forest.x1 - forest.x0 - 20), y: 650 + rand() * 95, s: 0.7 + rand() * 0.6 });
    }
    trees.sort((a, b) => a.y - b.y);

    const town = ZONES.find((z) => z.id === "town");
    const houses = [];
    let hx = town.x0 + 6;
    while (hx < town.x1 - 40) {
      const w = 38 + rand() * 26;
      houses.push({ x: hx, y: 668 + rand() * 50, w, h: 28 + rand() * 20, lit: rand() > 0.35, steeple: false });
      hx += w + 6 + rand() * 12;
    }
    houses[Math.floor(houses.length / 2)].steeple = true;
    houses.sort((a, b) => a.y - b.y);

    const stars = [];
    for (let i = 0; i < 140; i++) stars.push({ x: rand() * W, y: rand() * 520, r: 0.6 + rand() * 1.4, tw: rand() * Math.PI * 2 });

    return { ridge, hills, fields, trees, houses, stars };
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.scenery = buildScenery();
      this.drops = [];
      this.splashes = [];
      this.rainCarry = new Map();
      this.rand = rng(7);
      this.theme = "day";
      this.resize();
    }

    setTheme(theme) {
      this.theme = PALETTES[theme] ? theme : "day";
    }

    resize() {
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      const w = this.canvas.clientWidth || root.innerWidth;
      const h = this.canvas.clientHeight || root.innerHeight;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      const scale = Math.min(w / W, h / H);
      this.view = { w, h, dpr, scale, ox: (w - W * scale) / 2, oy: (h - H * scale) / 2 };
    }

    // Visible logical-x range, including letterbox margins that the backdrop fills.
    spanX() {
      const { w, scale, ox } = this.view;
      return [-ox / scale - 2, (w - ox) / scale + 2];
    }

    spanY() {
      const { h, scale, oy } = this.view;
      return [-oy / scale - 2, (h - oy) / scale + 2];
    }

    render(world, dt) {
      const ctx = this.ctx;
      const pal = PALETTES[this.theme];
      const { dpr, scale, ox, oy } = this.view;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
      const [x0, x1] = this.spanX();
      const [y0, y1] = this.spanY();

      const sky = ctx.createLinearGradient(0, y0, 0, HORIZON);
      sky.addColorStop(0, pal.skyTop);
      sky.addColorStop(0.62, pal.skyMid);
      sky.addColorStop(1, pal.skyHorizon);
      ctx.fillStyle = sky;
      ctx.fillRect(x0, y0, x1 - x0, HORIZON - y0 + 1);

      this.drawCelestial(ctx, pal, world.t);
      for (const a of world.ambient) this.drawAmbientCloud(ctx, a, pal);
      this.drawLand(ctx, pal, x0, x1, y1, world.t);

      const players = [...world.players.values()].sort((a, b) => a.y - b.y);
      for (const p of players) this.drawShadow(ctx, p, pal);
      this.updateRain(world, dt);
      this.drawRain(ctx, pal);
      for (const p of players) this.drawPlayerCloud(ctx, p, pal);
      for (const p of players) this.drawTag(ctx, p, pal);
    }

    drawCelestial(ctx, pal, t) {
      if (pal.stars > 0) {
        for (const s of this.scenery.stars) {
          ctx.globalAlpha = pal.stars * (0.55 + 0.45 * Math.sin(t * 1.3 + s.tw));
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      const pos = this.theme === "day" ? [1330, 150, 46] : this.theme === "twilight" ? [1180, 560, 70] : [300, 130, 34];
      const [sx, sy, r] = pos;
      const glow = ctx.createRadialGradient(sx, sy, r * 0.6, sx, sy, r * 4);
      glow.addColorStop(0, pal.sunGlow);
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(sx - r * 4, sy - r * 4, r * 8, r * 8);
      ctx.fillStyle = pal.sun;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      if (this.theme === "night") {
        // Crescent: the disc minus an offset disc, clipped to the moon so nothing spills onto the sky.
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.arc(sx + r * 0.45, sy - r * 0.2, r * 0.88, 0, Math.PI * 2);
        ctx.fill("evenodd");
        ctx.restore();
      } else {
        ctx.fill();
      }
    }

    drawAmbientCloud(ctx, a, pal) {
      const r = rng(a.seed);
      ctx.save();
      ctx.globalAlpha = pal.ambientAlpha * 0.7;
      ctx.translate(a.x, a.y);
      ctx.scale(a.scale, a.scale);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const px = -90 + i * 36 + r() * 10;
        const py = -Math.sin((i / 5) * Math.PI) * 24 + r() * 8;
        const pr = 22 + Math.sin((i / 5) * Math.PI) * 18 + r() * 8;
        ctx.moveTo(px + pr, py);
        ctx.arc(px, py, pr, 0, Math.PI * 2);
      }
      ctx.roundRect(-110, -6, 220, 26, 13);
      const g = ctx.createLinearGradient(0, -60, 0, 24);
      g.addColorStop(0, pal.cloudLit);
      g.addColorStop(1, pal.cloudMid);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }

    drawLand(ctx, pal, x0, x1, y1, t) {
      const s = this.scenery;
      const poly = (pts, color, bottom) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], bottom);
        for (const [x, y] of pts) ctx.lineTo(x, y);
        ctx.lineTo(pts[pts.length - 1][0], bottom);
        ctx.closePath();
        ctx.fill();
      };
      poly(s.ridge, pal.ridgeFar, HORIZON + 20);
      poly(s.hills, pal.ridgeNear, HORIZON + 20);

      const ground = ctx.createLinearGradient(0, HORIZON - 10, 0, y1);
      ground.addColorStop(0, pal.ground);
      ground.addColorStop(1, pal.groundDeep);
      ctx.fillStyle = ground;
      ctx.beginPath();
      ctx.moveTo(x0, y1);
      ctx.lineTo(x0, HORIZON + 4);
      for (let x = Math.floor(x0 / 40) * 40; x <= x1 + 40; x += 40) ctx.lineTo(x, HORIZON + Math.sin(x / 130) * 6);
      ctx.lineTo(x1, y1);
      ctx.closePath();
      ctx.fill();

      // Lake
      const lake = ZONES.find((z) => z.id === "lake");
      const lx = (lake.x0 + lake.x1) / 2;
      const lrx = (lake.x1 - lake.x0) / 2;
      ctx.fillStyle = pal.lake;
      ctx.beginPath();
      ctx.ellipse(lx, 705, lrx, 42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = pal.lakeLit;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const wx = lx - lrx * 0.6 + ((i * 53 + t * 12) % (lrx * 1.2));
        const wy = 690 + (i % 3) * 12;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + 26, wy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (const f of s.fields) {
        ctx.fillStyle = pal.fields[f.c];
        ctx.beginPath();
        ctx.moveTo(f.x + 6, f.y);
        ctx.lineTo(f.x + f.w + 6, f.y);
        ctx.lineTo(f.x + f.w, f.y + f.h);
        ctx.lineTo(f.x, f.y + f.h);
        ctx.closePath();
        ctx.fill();
        if (f.rows) {
          ctx.strokeStyle = "rgba(0,0,0,0.08)";
          ctx.lineWidth = 1.5;
          for (let k = 8; k < f.w; k += 9) {
            ctx.beginPath();
            ctx.moveTo(f.x + k + 6, f.y + 2);
            ctx.lineTo(f.x + k, f.y + f.h - 2);
            ctx.stroke();
          }
        }
      }

      for (const tr of s.trees) {
        const h = 46 * tr.s;
        const w = 18 * tr.s;
        ctx.fillStyle = pal.trunk;
        ctx.fillRect(tr.x - 2, tr.y - 4, 4, 8);
        ctx.fillStyle = pal.treeDark;
        ctx.beginPath();
        ctx.moveTo(tr.x, tr.y - h);
        ctx.lineTo(tr.x + w, tr.y);
        ctx.lineTo(tr.x, tr.y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = pal.tree;
        ctx.beginPath();
        ctx.moveTo(tr.x, tr.y - h);
        ctx.lineTo(tr.x, tr.y);
        ctx.lineTo(tr.x - w, tr.y);
        ctx.closePath();
        ctx.fill();
      }

      for (const hs of s.houses) {
        const top = hs.y - hs.h;
        ctx.fillStyle = pal.wall;
        ctx.fillRect(hs.x, top, hs.w, hs.h);
        ctx.fillStyle = pal.wallShade;
        ctx.fillRect(hs.x + hs.w * 0.72, top, hs.w * 0.28, hs.h);
        ctx.fillStyle = pal.roof;
        ctx.beginPath();
        ctx.moveTo(hs.x - 4, top);
        ctx.lineTo(hs.x + hs.w / 2, top - hs.w * 0.42);
        ctx.lineTo(hs.x + hs.w + 4, top);
        ctx.closePath();
        ctx.fill();
        if (hs.steeple) {
          ctx.fillStyle = pal.wall;
          ctx.fillRect(hs.x + hs.w / 2 - 6, top - hs.w * 0.42 - 34, 12, 40);
          ctx.fillStyle = pal.roofDark;
          ctx.beginPath();
          ctx.moveTo(hs.x + hs.w / 2 - 9, top - hs.w * 0.42 - 34);
          ctx.lineTo(hs.x + hs.w / 2, top - hs.w * 0.42 - 62);
          ctx.lineTo(hs.x + hs.w / 2 + 9, top - hs.w * 0.42 - 34);
          ctx.closePath();
          ctx.fill();
        }
        const lit = pal.windowGlow > 0 && hs.lit;
        ctx.fillStyle = lit ? pal.window : pal.windowGlow > 0 ? pal.wallShade : pal.window;
        if (lit) {
          ctx.shadowColor = pal.window;
          ctx.shadowBlur = 10 * pal.windowGlow;
        }
        ctx.fillRect(hs.x + hs.w * 0.2, top + hs.h * 0.3, 7, 8);
        ctx.fillRect(hs.x + hs.w * 0.48, top + hs.h * 0.3, 7, 8);
        ctx.shadowBlur = 0;
      }
    }

    // Where a cloud's shadow and rain land: ground directly below, a little forward for depth.
    groundY(p) {
      return HORIZON + 40 + ((p.y - 90) / 380) * 80;
    }

    drawShadow(ctx, p, pal) {
      ctx.save();
      ctx.globalAlpha = p.connected ? 1 : 0.4;
      ctx.fillStyle = pal.shadow;
      ctx.beginPath();
      ctx.ellipse(p.x, this.groundY(p), 115, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    updateRain(world, dt) {
      const step = Math.min(dt, 0.05);
      for (const p of world.players.values()) {
        if (!p.input.rain) continue;
        let carry = (this.rainCarry.get(p.id) || 0) + 110 * step;
        const gy = this.groundY(p);
        while (carry >= 1) {
          carry -= 1;
          this.drops.push({ x: p.x + (this.rand() - 0.5) * 190, y: p.y + 18, vx: p.vx * 0.25, vy: 520 + this.rand() * 220, gy: gy - 12 + this.rand() * 24, color: p.color });
        }
        this.rainCarry.set(p.id, carry);
      }
      for (const d of this.drops) {
        d.x += d.vx * step;
        d.y += d.vy * step;
        if (d.y >= d.gy) {
          d.dead = true;
          this.splashes.push({ x: d.x, y: d.gy, age: 0 });
        }
      }
      this.drops = this.drops.filter((d) => !d.dead);
      for (const s of this.splashes) s.age += step;
      this.splashes = this.splashes.filter((s) => s.age < 0.3);
    }

    drawRain(ctx, pal) {
      ctx.strokeStyle = pal.rain;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const d of this.drops) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.vx * 0.02, d.y - 14);
      }
      ctx.stroke();
      for (const s of this.splashes) {
        ctx.globalAlpha = 1 - s.age / 0.3;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 3 + s.age * 30, 1 + s.age * 6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    drawPlayerCloud(ctx, p, pal) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = p.connected ? 1 : 0.45;
      const tilt = Math.max(-0.08, Math.min(0.08, p.vx / 4000));
      ctx.rotate(tilt);

      const n = 9;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const bell = Math.sin(u * Math.PI);
        const px = -100 + u * 200;
        const pr = 24 + bell * 18 + Math.sin(p.roll * 2 + i * 1.7) * 3.5;
        const py = -bell * 12 + Math.cos(p.roll + i * 0.9) * 3;
        ctx.moveTo(px + pr, py);
        ctx.arc(px, py, pr, 0, Math.PI * 2);
      }
      ctx.roundRect(-118, -8, 236, 34, 17);

      const body = ctx.createLinearGradient(0, -62, 0, 28);
      body.addColorStop(0, pal.cloudLit);
      body.addColorStop(0.55, pal.cloudMid);
      body.addColorStop(1, pal.cloudShade);
      ctx.fillStyle = body;
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;
      ctx.fill();
      ctx.shadowColor = "transparent";

      // The player's color glows through the cloud's belly.
      const belly = ctx.createLinearGradient(0, -20, 0, 28);
      belly.addColorStop(0, "rgba(255,255,255,0)");
      belly.addColorStop(1, p.color);
      ctx.globalAlpha *= 0.55;
      ctx.fillStyle = belly;
      ctx.fill();
      ctx.globalAlpha = p.connected ? 1 : 0.45;

      // Rolling bands sweep around the tube to sell the "volutus" tumble.
      ctx.clip();
      ctx.lineWidth = 5;
      for (let k = 0; k < 4; k++) {
        const phase = p.roll * 1.6 + (k * Math.PI) / 2;
        const depth = Math.sin(phase);
        if (depth <= 0) continue;
        const yy = -6 + Math.cos(phase) * 26;
        ctx.strokeStyle = `rgba(255,255,255,${0.22 * depth})`;
        ctx.beginPath();
        ctx.moveTo(-120, yy + 6);
        ctx.quadraticCurveTo(0, yy - 6, 120, yy + 6);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawTag(ctx, p, pal) {
      const label = p.connected ? p.name : `${p.name} (away)`;
      ctx.save();
      ctx.globalAlpha = p.connected ? 1 : 0.6;
      ctx.font = "600 17px Inter, system-ui, -apple-system, sans-serif";
      const tw = ctx.measureText(label).width;
      const w = tw + 34;
      const x = p.x - w / 2;
      const y = p.y - 84;
      ctx.fillStyle = pal.tagBg;
      ctx.beginPath();
      ctx.roundRect(x, y, w, 26, 13);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x + 14, y + 13, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.tagInk;
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 26, y + 14);
      ctx.restore();
    }
  }

  V.Renderer = Renderer;
  V.PALETTES = PALETTES;
})(typeof window !== "undefined" ? window : globalThis);
