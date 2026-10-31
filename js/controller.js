/* Volutus — phone controller. Turns touch or tilt into a steering vector and sends it to the host. */
(function () {
  "use strict";

  const V = window.Volutus;
  const { util } = V;
  const NAME_KEY = "volutus_name";
  const ID_KEY = "volutus_player_id";
  const SEND_EVERY_MS = 50;
  const TILT_RANGE_DEG = 22;
  const STICK_RADIUS = 70;

  const el = {};
  const state = {
    relay: util.relayUrl(),
    room: "",
    name: "",
    id: "",
    link: null,
    input: { x: 0, y: 0, rain: false },
    lastSent: "",
    drag: null,
    tilt: { on: false, x: 0, y: 0, neutral: null },
    wakeLock: null,
    sendTimer: null,
  };

  const $ = (id) => document.getElementById(id);
  const clamp = (v) => Math.max(-1, Math.min(1, v));

  function playerId() {
    let id = localStorage.getItem(ID_KEY);
    if (!/^[a-z0-9]{6,16}$/.test(id || "")) {
      id = util.randomId(12);
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  }

  // ---------- Joining ----------
  function showJoin(error) {
    stopLink();
    el.playScreen.hidden = true;
    el.joinScreen.hidden = false;
    el.joinError.hidden = !error;
    el.joinError.textContent = error || "";
  }

  function join(room, name) {
    state.room = room;
    state.name = name;
    state.id = playerId();
    localStorage.setItem(NAME_KEY, name);
    const url = new URL(location.href);
    url.searchParams.set("room", room);
    history.replaceState(null, "", url);

    el.joinScreen.hidden = true;
    el.playScreen.hidden = false;
    el.meName.textContent = name;
    el.meRoom.textContent = room;
    el.meColor.textContent = "Joining";
    el.meSwatch.style.background = "";

    stopLink();
    const params = new URLSearchParams({ role: "player", id: state.id, name });
    state.link = new V.Link({ url: `${state.relay}/room/${room}?${params}`, onMessage: handleMessage, onStatus: handleStatus });
    state.link.connect();
    state.sendTimer = setInterval(flush, SEND_EVERY_MS);
    keepAwake();
  }

  function stopLink() {
    clearInterval(state.sendTimer);
    if (state.link) state.link.close();
    state.link = null;
  }

  function handleMessage(msg) {
    switch (msg.t) {
      case "welcome":
        state.lastSent = "";
        hideOverlay();
        break;
      case "you":
        el.meSwatch.style.background = msg.color;
        el.meColor.textContent = `${msg.colorName} cloud`;
        document.documentElement.style.setProperty("--me", msg.color);
        break;
      case "water":
        renderWater(msg);
        break;
      case "host-left":
        showOverlay("The big screen went away. Waiting for it to come back…");
        break;
      case "host-back":
        hideOverlay();
        break;
      case "full":
        showJoin("That sky is full — 8 clouds max.");
        break;
    }
  }

  function renderWater({ v, soaking, empty }) {
    const pct = Math.max(0, Math.min(1, Number(v) || 0)) * 100;
    el.gaugeFill.style.width = `${pct}%`;
    el.gauge.classList.toggle("is-soaking", Boolean(soaking));
    el.gauge.classList.toggle("is-empty", Boolean(empty));
    el.rainBtn.classList.toggle("is-empty", Boolean(empty));
    el.rainLabel.textContent = empty ? "Empty — float over the lake" : soaking ? "Soaking up water…" : "Hold to rain";
  }

  function handleStatus(status) {
    el.status.dataset.state = status;
    if (status === "no-host") showJoin(`Room ${state.room} isn't open. Check the code on the big screen.`);
    else if (status === "full") showJoin("That sky is full — 8 clouds max.");
    else if (status === "replaced") showOverlay("You're flying this cloud from another tab.", "Fly it here", () => state.link.connect());
    else if (status === "reconnecting" && state.link && state.link.attempt > 1) showOverlay("Reconnecting…");
    else if (status === "open") hideOverlay();
  }

  function showOverlay(text, actionLabel, action) {
    el.overlayText.textContent = text;
    el.overlayBtn.hidden = !actionLabel;
    el.overlayBtn.textContent = actionLabel || "";
    el.overlayBtn.onclick = () => {
      hideOverlay();
      action && action();
    };
    el.overlay.hidden = false;
  }

  function hideOverlay() {
    el.overlay.hidden = true;
  }

  // ---------- Input ----------
  function currentVector() {
    if (state.drag) return { x: state.drag.x, y: state.drag.y };
    if (state.tilt.on) return { x: state.tilt.x, y: state.tilt.y };
    return { x: 0, y: 0 };
  }

  function flush() {
    if (!state.link) return;
    const v = currentVector();
    const msg = { t: "in", x: Math.round(v.x * 100) / 100, y: Math.round(v.y * 100) / 100, rain: state.input.rain };
    const key = `${msg.x},${msg.y},${msg.rain}`;
    if (key === state.lastSent) return;
    if (state.link.send(msg)) state.lastSent = key;
  }

  function setKnob(x, y) {
    el.stickKnob.style.transform = `translate(${x * STICK_RADIUS}px, ${y * STICK_RADIUS}px)`;
  }

  function onPointerDown(ev) {
    if (state.drag) return;
    el.stickArea.setPointerCapture(ev.pointerId);
    const rect = el.stickArea.getBoundingClientRect();
    state.drag = { id: ev.pointerId, ox: ev.clientX, oy: ev.clientY, x: 0, y: 0 };
    el.stickBase.style.left = `${ev.clientX - rect.left}px`;
    el.stickBase.style.top = `${ev.clientY - rect.top}px`;
    el.stickArea.classList.add("is-dragging");
    setKnob(0, 0);
  }

  function onPointerMove(ev) {
    const d = state.drag;
    if (!d || ev.pointerId !== d.id) return;
    let x = (ev.clientX - d.ox) / STICK_RADIUS;
    let y = (ev.clientY - d.oy) / STICK_RADIUS;
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    d.x = x;
    d.y = y;
    setKnob(x, y);
  }

  function onPointerUp(ev) {
    if (!state.drag || ev.pointerId !== state.drag.id) return;
    state.drag = null;
    el.stickArea.classList.remove("is-dragging");
    el.stickBase.style.left = "";
    el.stickBase.style.top = "";
    setKnob(state.tilt.on ? state.tilt.x : 0, state.tilt.on ? state.tilt.y : 0);
  }

  function setRain(on) {
    state.input.rain = on;
    el.rainBtn.classList.toggle("is-active", on);
    el.rainBtn.setAttribute("aria-pressed", String(on));
    flush();
  }

  // ---------- Tilt ----------
  function screenAngle() {
    const a = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
    return ((a % 360) + 360) % 360;
  }

  function onOrientation(ev) {
    if (ev.beta == null || ev.gamma == null) return;
    const angle = screenAngle();
    let x = ev.gamma;
    let y = ev.beta;
    if (angle === 90) [x, y] = [ev.beta, -ev.gamma];
    else if (angle === 270) [x, y] = [-ev.beta, ev.gamma];
    else if (angle === 180) [x, y] = [-ev.gamma, -ev.beta];
    if (!state.tilt.neutral) state.tilt.neutral = { x, y };
    state.tilt.x = clamp((x - state.tilt.neutral.x) / TILT_RANGE_DEG);
    state.tilt.y = clamp((y - state.tilt.neutral.y) / TILT_RANGE_DEG);
    if (!state.drag) setKnob(state.tilt.x, state.tilt.y);
  }

  async function toggleTilt() {
    if (state.tilt.on) {
      state.tilt.on = false;
      window.removeEventListener("deviceorientation", onOrientation);
      setKnob(0, 0);
      renderTilt();
      return;
    }
    if (!("DeviceOrientationEvent" in window)) {
      flashHint("This device has no tilt sensor — drag to steer.");
      return;
    }
    if (!window.isSecureContext) {
      flashHint("Tilt needs an https:// page — drag to steer for now.");
      return;
    }
    try {
      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== "granted") {
          flashHint("Motion access was denied. Allow it in Safari settings, or drag to steer.");
          return;
        }
      }
    } catch {
      flashHint("Couldn't turn on tilt — drag to steer.");
      return;
    }
    state.tilt = { on: true, x: 0, y: 0, neutral: null };
    window.addEventListener("deviceorientation", onOrientation);
    renderTilt();
    flashHint("Hold the phone how you like — that's level. Tilt to steer.");
  }

  function renderTilt() {
    el.tiltBtn.classList.toggle("is-active", state.tilt.on);
    el.tiltBtn.setAttribute("aria-pressed", String(state.tilt.on));
    el.tiltLabel.textContent = state.tilt.on ? "Tilt on" : "Tilt";
    el.stickHint.textContent = state.tilt.on ? "Tilt to steer · tap Tilt to turn it off" : "Drag anywhere to steer";
  }

  let hintTimer = null;
  function flashHint(text) {
    el.stickHint.textContent = text;
    el.stickHint.classList.add("is-flash");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      el.stickHint.classList.remove("is-flash");
      renderTilt();
    }, 3500);
  }

  async function keepAwake() {
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible" && !state.wakeLock) {
        state.wakeLock = await navigator.wakeLock.request("screen");
        state.wakeLock.addEventListener("release", () => (state.wakeLock = null));
      }
    } catch {
      // Unsupported or not allowed; the screen may dim, which is fine.
    }
  }

  function bind() {
    [
      "joinScreen", "playScreen", "joinForm", "roomInput", "nameInput", "joinError", "meSwatch", "meName", "meColor", "meRoom",
      "status", "leaveBtn", "stickArea", "stickBase", "stickKnob", "stickHint", "tiltBtn", "tiltLabel", "rainBtn", "overlay",
      "overlayText", "overlayBtn", "gauge", "gaugeFill", "rainLabel",
    ].forEach((id) => (el[id] = $(id)));

    el.roomInput.addEventListener("input", () => {
      el.roomInput.value = el.roomInput.value.toUpperCase().replace(/[^A-Z]/g, "").replace(/[IO]/g, "");
    });
    el.joinForm.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const room = el.roomInput.value.trim().toUpperCase();
      const name = el.nameInput.value.trim().slice(0, 16);
      if (!util.isRoomCode(room)) return showJoin("Room codes are 4 letters, like KXRM.");
      if (!name) return showJoin("Give your cloud a name.");
      join(room, name);
    });
    el.leaveBtn.addEventListener("click", () => showJoin());

    el.stickArea.addEventListener("pointerdown", onPointerDown);
    el.stickArea.addEventListener("pointermove", onPointerMove);
    el.stickArea.addEventListener("pointerup", onPointerUp);
    el.stickArea.addEventListener("pointercancel", onPointerUp);

    el.rainBtn.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      el.rainBtn.setPointerCapture(ev.pointerId);
      setRain(true);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => el.rainBtn.addEventListener(type, () => setRain(false)));
    el.rainBtn.addEventListener("contextmenu", (ev) => ev.preventDefault());
    el.tiltBtn.addEventListener("click", toggleTilt);

    document.addEventListener("gesturestart", (ev) => ev.preventDefault());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        state.drag = null;
        setRain(false);
        if (state.link) state.link.send({ t: "in", x: 0, y: 0, rain: false });
      } else {
        state.lastSent = "";
        if (state.link && state.link.status !== "open" && !el.playScreen.hidden) state.link.connect();
        keepAwake();
      }
    });
  }

  function init() {
    bind();
    util.applyTheme();
    const params = new URLSearchParams(location.search);
    const room = (params.get("room") || "").toUpperCase();
    const name = localStorage.getItem(NAME_KEY) || "";
    el.roomInput.value = util.isRoomCode(room) ? room : "";
    el.nameInput.value = name;
    if (util.isRoomCode(room) && name) join(room, name);
    else (util.isRoomCode(room) ? el.nameInput : el.roomInput).focus();
    V.controller = state;
  }

  init();
})();
