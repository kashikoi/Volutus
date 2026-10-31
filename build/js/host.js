/* Volutus — host (the Mac screen). Owns the world, renders it, and talks to phones through the relay. */
(function () {
  "use strict";

  const V = window.Volutus;
  const { util, world: Wd } = V;
  const ROOM_KEY = "volutus_room";
  const KEYBOARD_ID = "keyboard";

  const el = {};
  const state = {
    room: null,
    relay: util.relayUrl(),
    link: null,
    world: Wd.createWorld(),
    renderer: null,
    joinOpen: true,
    keyboard: false,
    keys: new Set(),
    wakeLock: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function joinUrl() {
    const url = new URL("play.html", location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("room", state.room);
    if (state.relay !== util.DEFAULT_RELAY) url.searchParams.set("relay", state.relay);
    return url.toString();
  }

  function shortPlayUrl() {
    const url = new URL("play.html", location.href);
    return `${url.host}${url.pathname}`;
  }

  // ---------- Room & relay ----------
  function startRoom(code) {
    state.room = util.isRoomCode(code) ? code : util.roomCode();
    sessionStorage.setItem(ROOM_KEY, state.room);
    for (const p of [...state.world.players.values()]) if (p.id !== KEYBOARD_ID) state.world.players.delete(p.id);
    if (state.link) state.link.close();
    state.link = new V.Link({
      url: `${state.relay}/room/${state.room}?role=host`,
      onMessage: handleMessage,
      onStatus: renderStatus,
    });
    state.link.connect();
    renderJoinCard();
    renderRoster();
  }

  function sendTo(id, d) {
    if (id === KEYBOARD_ID) return;
    state.link && state.link.send({ to: id, d });
  }

  function greet(id, name) {
    const p = Wd.addPlayer(state.world, id, name);
    if (!p) {
      sendTo(id, { t: "full" });
      return;
    }
    sendTo(id, { t: "you", name: p.name, color: p.color, colorName: p.colorName });
    if (id !== KEYBOARD_ID && state.joinOpen && realPlayers().length === 1) setJoinOpen(false);
  }

  function handleMessage(msg) {
    switch (msg.t) {
      case "welcome":
        for (const p of state.world.players.values()) if (p.id !== KEYBOARD_ID) Wd.disconnectPlayer(state.world, p.id);
        for (const p of msg.players || []) greet(p.id, p.name);
        break;
      case "join":
        greet(msg.id, msg.name);
        break;
      case "leave":
        Wd.disconnectPlayer(state.world, msg.id);
        break;
      case "msg":
        if (msg.d && msg.d.t === "in") Wd.setInput(state.world, msg.from, msg.d);
        break;
      default:
        return;
    }
    renderRoster();
  }

  // ---------- Keyboard cloud (try it without a phone) ----------
  function toggleKeyboard() {
    state.keyboard = !state.keyboard;
    if (state.keyboard) greet(KEYBOARD_ID, "Keyboard");
    else state.world.players.delete(KEYBOARD_ID);
    el.kbBtn.classList.toggle("is-active", state.keyboard);
    el.kbBtn.setAttribute("aria-pressed", String(state.keyboard));
    renderRoster();
  }

  function keyboardInput() {
    const k = state.keys;
    const x = (k.has("ArrowRight") || k.has("KeyD") ? 1 : 0) - (k.has("ArrowLeft") || k.has("KeyA") ? 1 : 0);
    const y = (k.has("ArrowDown") || k.has("KeyS") ? 1 : 0) - (k.has("ArrowUp") || k.has("KeyW") ? 1 : 0);
    Wd.setInput(state.world, KEYBOARD_ID, { x, y, rain: k.has("Space") });
  }

  // ---------- UI ----------
  function realPlayers() {
    return [...state.world.players.values()].filter((p) => p.id !== KEYBOARD_ID);
  }

  function renderJoinCard() {
    const url = joinUrl();
    el.qr.innerHTML = V.qr.toSvg(url);
    el.miniQr.innerHTML = V.qr.toSvg(url);
    el.roomCode.textContent = state.room;
    el.miniRoom.textContent = state.room;
    el.joinUrl.textContent = shortPlayUrl();
    el.joinLink.href = url;
  }

  function setJoinOpen(open) {
    state.joinOpen = open;
    el.joinCard.hidden = !open;
    el.joinMini.hidden = open;
  }

  function renderRoster() {
    const players = [...state.world.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    el.roster.innerHTML = players
      .map(
        (p) =>
          `<li class="chip${p.connected ? "" : " is-away"}"><span class="chip__dot" style="background:${p.color}"></span>${util.escapeHtml(p.name)}${p.connected ? "" : " <em>away</em>"}</li>`,
      )
      .join("");
    el.roster.hidden = players.length === 0;
    el.emptyHint.hidden = players.length > 0;
  }

  const STATUS_TEXT = {
    connecting: "Connecting…",
    open: "Live",
    reconnecting: "Reconnecting…",
    error: "Relay error",
    closed: "Offline",
    replaced: "Open elsewhere",
  };

  function renderStatus(status, detail) {
    el.status.dataset.state = status;
    el.statusText.textContent = STATUS_TEXT[status] || status;
    if (status === "replaced") {
      showBanner("This room was opened on another screen.", "Take it back", () => {
        hideBanner();
        state.link.connect();
      });
    } else if (status === "open") {
      hideBanner();
    } else if (status === "reconnecting" && state.link && state.link.attempt > 3) {
      showBanner(`Can't reach the relay at ${state.relay}. Retrying…`, "Settings", openSettings);
    }
    if (detail && status === "error") console.warn("Relay:", detail);
  }

  function showBanner(text, actionLabel, action) {
    el.bannerText.textContent = text;
    el.bannerBtn.hidden = !actionLabel;
    el.bannerBtn.textContent = actionLabel || "";
    el.bannerBtn.onclick = action || null;
    el.banner.hidden = false;
  }

  function hideBanner() {
    el.banner.hidden = true;
  }

  function updateThemePicker() {
    const pref = util.getThemePref();
    el.themePicker.querySelectorAll(".theme-chip").forEach((c) => c.classList.toggle("is-active", c.dataset.themeVal === pref));
  }

  function openSettings() {
    updateThemePicker();
    el.relayInput.value = state.relay;
    el.relayError.hidden = true;
    el.settings.showModal();
  }

  function saveRelay() {
    const value = el.relayInput.value.trim() || util.DEFAULT_RELAY;
    try {
      util.setRelayUrl(value);
    } catch (err) {
      el.relayError.textContent = err.message;
      el.relayError.hidden = false;
      return;
    }
    state.relay = util.relayUrl("");
    el.relayError.hidden = true;
    startRoom(state.room);
  }

  async function keepAwake() {
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible" && !state.wakeLock) {
        state.wakeLock = await navigator.wakeLock.request("screen");
        state.wakeLock.addEventListener("release", () => (state.wakeLock = null));
      }
    } catch {
      // Not allowed (e.g. no user gesture yet); harmless.
    }
  }

  // ---------- Loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = (now - last) / 1000;
    last = now;
    if (state.keyboard) keyboardInput();
    const before = state.world.players.size;
    Wd.step(state.world, dt);
    if (state.world.players.size !== before) renderRoster();
    state.renderer.render(state.world, dt);
    requestAnimationFrame(frame);
  }

  function bind() {
    [
      "sky", "status", "statusText", "kbBtn", "fsBtn", "settingsBtn", "joinCard", "joinMini", "joinClose", "qr", "miniQr",
      "roomCode", "miniRoom", "joinUrl", "joinLink", "roster", "emptyHint", "banner", "bannerText", "bannerBtn", "settings",
      "themePicker", "relayInput", "relaySave", "relayReset", "relayError", "newRoomBtn", "version", "settingsClose",
    ].forEach((id) => (el[id] = $(id)));

    el.version.textContent = util.APP_VERSION;
    el.kbBtn.addEventListener("click", toggleKeyboard);
    el.fsBtn.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    });
    el.settingsBtn.addEventListener("click", openSettings);
    el.settingsClose.addEventListener("click", () => el.settings.close());
    el.joinClose.addEventListener("click", () => setJoinOpen(false));
    el.joinMini.addEventListener("click", () => setJoinOpen(true));
    el.themePicker.addEventListener("click", (ev) => {
      const chip = ev.target.closest(".theme-chip");
      if (!chip) return;
      state.renderer.setTheme(util.setThemePref(chip.dataset.themeVal));
      updateThemePicker();
    });
    el.relaySave.addEventListener("click", saveRelay);
    el.relayReset.addEventListener("click", () => {
      el.relayInput.value = util.DEFAULT_RELAY;
      saveRelay();
    });
    el.newRoomBtn.addEventListener("click", () => {
      startRoom(null);
      setJoinOpen(true);
      el.settings.close();
    });

    const GAME_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "Space"]);
    window.addEventListener("keydown", (ev) => {
      if (ev.target.closest && ev.target.closest("input, textarea, dialog")) return;
      if (ev.code === "KeyK" && !ev.metaKey && !ev.ctrlKey) toggleKeyboard();
      if (state.keyboard && GAME_KEYS.has(ev.code)) {
        state.keys.add(ev.code);
        ev.preventDefault();
      }
    });
    window.addEventListener("keyup", (ev) => state.keys.delete(ev.code));
    window.addEventListener("blur", () => state.keys.clear());
    window.addEventListener("resize", () => state.renderer.resize());
    document.addEventListener("visibilitychange", keepAwake);
    document.addEventListener("pointerdown", keepAwake, { once: true });
  }

  function init() {
    bind();
    state.renderer = new V.Renderer(el.sky);
    state.renderer.setTheme(util.applyTheme());
    startRoom(new URLSearchParams(location.search).get("room") || sessionStorage.getItem(ROOM_KEY));
    setJoinOpen(true);
    keepAwake();
    requestAnimationFrame(frame);
    V.host = state;
  }

  init();
})();
