
(() => {
  "use strict";

  const DEFAULT_MANIFEST = {
    generatedAt: new Date().toISOString(),
    models: {
      gfs: {
        label: "GFS",
        resolution: "0,25°",
        basePath: "maps/gfs",
        frames: Array.from({length: 49}, (_, i) => ({
          hour: i * 3,
          file: `gfs_${String(i * 3).padStart(3, "0")}.png`
        }))
      },
      ecmwf: {
        label: "IFS",
        resolution: "0,25°",
        basePath: "maps/ecmwf",
        frames: Array.from({length: 49}, (_, i) => ({
          hour: i * 3,
          file: `ecmwf_${String(i * 3).padStart(3, "0")}.png`
        }))
      },
      icon_eu: {
        label: "ICON-EU",
        resolution: "0,125°",
        basePath: "maps/icon_eu",
        frames: Array.from({length: 41}, (_, i) => ({
          hour: i * 3,
          file: `icon_eu_${String(i * 3).padStart(3, "0")}.png`
        }))
      }
    }
  };

  const state = {
    manifest: null,
    modelKey: null,
    selectedIndex: 0,
    previewIndex: null,
    playing: false,
    timer: null,
    preloadCache: new Map(),
    hoverTimer: null
  };

  const el = {
    player: document.getElementById("weatherPlayer"),
    sidebar: document.getElementById("weatherSidebar"),
    sidebarToggle: document.getElementById("sidebarToggle"),
    sidebarClose: document.getElementById("sidebarClose"),
    modelTabs: document.getElementById("modelTabs"),
    timeline: document.getElementById("timeline"),
    frameCount: document.getElementById("frameCount"),
    currentMap: document.getElementById("currentMap"),
    nextMap: document.getElementById("nextMap"),
    currentLayer: document.querySelector(".image-layer.current"),
    nextLayer: document.querySelector(".image-layer.next"),
    modelBadge: document.getElementById("modelBadge"),
    mapTitle: document.getElementById("mapTitle"),
    mapMeta: document.getElementById("mapMeta"),
    loader: document.getElementById("mapLoader"),
    error: document.getElementById("mapError"),
    tooltip: document.getElementById("hoverTooltip"),
    previous: document.getElementById("previousFrame"),
    playPause: document.getElementById("playPause"),
    next: document.getElementById("nextFrame"),
    speed: document.getElementById("playSpeed"),
    mobileRange: document.getElementById("mobileRange"),
    mobileOutput: document.getElementById("mobileOutput")
  };

  function getModel() {
    return state.manifest.models[state.modelKey];
  }

  function frameUrl(model, frame) {
    if (frame.url) return frame.url;
    return `${model.basePath.replace(/\/$/, "")}/${frame.file}`;
  }

  function validDate(frame) {
    if (frame.validTime) return new Date(frame.validTime);
    const generated = new Date(state.manifest.generatedAt || Date.now());
    return new Date(generated.getTime() + Number(frame.hour || 0) * 3600000);
  }

  function formatDate(frame) {
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(validDate(frame));
  }

  async function loadManifest() {
    try {
      const response = await fetch("maps/manifest.json", {cache: "no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data.models || !Object.keys(data.models).length) throw new Error("Manifest vide");
      return data;
    } catch (error) {
      console.warn("Manifest indisponible, utilisation du manifeste de démonstration.", error);
      return DEFAULT_MANIFEST;
    }
  }

  function normalizeManifest(manifest) {
    const normalized = structuredClone(manifest);
    Object.entries(normalized.models).forEach(([key, model]) => {
      model.label ||= key.toUpperCase();
      model.resolution ||= "";
      model.frames = (model.frames || [])
        .map((frame, index) => ({
          ...frame,
          hour: Number(frame.hour ?? frame.forecastHour ?? index * 3)
        }))
        .sort((a, b) => a.hour - b.hour);
    });
    return normalized;
  }

  function renderModels() {
    el.modelTabs.replaceChildren();
    Object.entries(state.manifest.models).forEach(([key, model]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "model-button";
      button.setAttribute("role", "tab");
      button.dataset.model = key;
      button.innerHTML = `
        <span class="model-short">${model.label}</span>
        <span class="model-resolution">${model.resolution || ""}</span>`;
      button.addEventListener("click", () => selectModel(key));
      el.modelTabs.appendChild(button);
    });
  }

  function renderTimeline() {
    const model = getModel();
    el.timeline.replaceChildren();
    el.frameCount.textContent = `${model.frames.length} cartes`;
    el.mobileRange.max = Math.max(0, model.frames.length - 1);

    model.frames.forEach((frame, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "timeline-button";
      button.dataset.index = String(index);
      button.setAttribute("role", "option");
      button.setAttribute("aria-label", `Échéance plus ${frame.hour} heures, ${formatDate(frame)}`);
      button.innerHTML = `
        <span class="timeline-dot"></span>
        <span class="timeline-label">
          <span class="timeline-hour">+${frame.hour} h</span>
          <span class="timeline-date">${formatDate(frame)}</span>
        </span>`;

      button.addEventListener("pointerenter", event => previewFrame(index, event.currentTarget));
      button.addEventListener("pointerleave", cancelPreview);
      button.addEventListener("focus", event => previewFrame(index, event.currentTarget));
      button.addEventListener("blur", cancelPreview);
      button.addEventListener("click", () => selectFrame(index, {lock: true}));

      el.timeline.appendChild(button);
    });

    updateSelectionUI();
  }

  function selectModel(key) {
    if (!state.manifest.models[key]) return;
    stopPlayback();
    state.modelKey = key;
    state.selectedIndex = 0;
    state.previewIndex = null;

    el.modelTabs.querySelectorAll(".model-button").forEach(button => {
      const active = button.dataset.model === key;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    renderTimeline();
    selectFrame(0, {lock: true, immediate: true});
    localStorage.setItem("meteo-lab-v6-model", key);
  }

  function previewFrame(index, target) {
    clearTimeout(state.hoverTimer);
    state.hoverTimer = setTimeout(() => {
      state.previewIndex = index;
      selectFrame(index, {lock: false});
      const frame = getModel().frames[index];
      el.tooltip.hidden = false;
      el.tooltip.textContent = `Prévision +${frame.hour} h — ${formatDate(frame)}. Cliquer pour verrouiller.`;
      target.classList.add("preview");
    }, 65);
  }

  function cancelPreview(event) {
    clearTimeout(state.hoverTimer);
    event?.currentTarget?.classList.remove("preview");
    el.tooltip.hidden = true;
    if (state.previewIndex !== null) {
      state.previewIndex = null;
      showImage(state.selectedIndex, {updateUI: false});
    }
  }

  function selectFrame(index, options = {}) {
    const model = getModel();
    if (!model.frames.length) return;
    const safeIndex = Math.max(0, Math.min(index, model.frames.length - 1));
    if (options.lock) {
      state.selectedIndex = safeIndex;
      state.previewIndex = null;
      el.tooltip.hidden = true;
      updateSelectionUI();
      preloadNeighbours(safeIndex);
    }
    showImage(safeIndex, {immediate: options.immediate, updateUI: options.lock});
  }

  function updateSelectionUI() {
    const frame = getModel().frames[state.selectedIndex];
    el.timeline.querySelectorAll(".timeline-button").forEach((button, index) => {
      const active = index === state.selectedIndex;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    const selected = el.timeline.querySelector(".timeline-button.active");
    selected?.scrollIntoView({block: "nearest", behavior: "smooth"});

    el.mobileRange.value = String(state.selectedIndex);
    el.mobileOutput.value = `+${frame?.hour ?? 0} h`;
    el.mobileOutput.textContent = `+${frame?.hour ?? 0} h`;
  }

  function showImage(index, {immediate = false} = {}) {
    const model = getModel();
    const frame = model.frames[index];
    if (!frame) return;

    const url = frameUrl(model, frame);
    el.loader.hidden = false;
    el.error.hidden = true;

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      el.nextMap.src = url;
      el.nextMap.alt = `${model.label}, échéance +${frame.hour} h`;

      if (immediate || !el.currentMap.src) {
        el.currentMap.src = url;
        el.currentMap.alt = el.nextMap.alt;
        el.loader.hidden = true;
      } else {
        el.nextLayer.style.opacity = "1";
        el.currentLayer.style.opacity = "0";
        window.setTimeout(() => {
          el.currentMap.src = url;
          el.currentMap.alt = el.nextMap.alt;
          el.currentLayer.style.opacity = "1";
          el.nextLayer.style.opacity = "0";
          el.loader.hidden = true;
        }, 190);
      }

      el.modelBadge.textContent = model.label;
      el.mapTitle.textContent = frame.title || "Carte de prévision";
      el.mapMeta.textContent = `Échéance +${frame.hour} h • valide ${formatDate(frame)}`;
    };
    image.onerror = () => {
      el.loader.hidden = true;
      el.error.hidden = false;
      el.mapMeta.textContent = `Échéance +${frame.hour} h indisponible`;
    };
    image.src = url;
  }

  function preloadNeighbours(index) {
    const model = getModel();
    [index - 1, index + 1, index + 2].forEach(candidate => {
      const frame = model.frames[candidate];
      if (!frame) return;
      const url = frameUrl(model, frame);
      if (state.preloadCache.has(url)) return;
      const image = new Image();
      image.src = url;
      state.preloadCache.set(url, image);
      if (state.preloadCache.size > 15) {
        const firstKey = state.preloadCache.keys().next().value;
        state.preloadCache.delete(firstKey);
      }
    });
  }

  function step(delta) {
    const count = getModel().frames.length;
    const nextIndex = (state.selectedIndex + delta + count) % count;
    selectFrame(nextIndex, {lock: true});
  }

  function startPlayback() {
    if (state.playing) return;
    state.playing = true;
    el.playPause.textContent = "⏸";
    el.playPause.classList.add("playing");
    el.playPause.setAttribute("aria-label", "Mettre en pause");
    scheduleNext();
  }

  function scheduleNext() {
    clearTimeout(state.timer);
    if (!state.playing) return;
    state.timer = setTimeout(() => {
      step(1);
      scheduleNext();
    }, Number(el.speed.value));
  }

  function stopPlayback() {
    state.playing = false;
    clearTimeout(state.timer);
    el.playPause.textContent = "▶";
    el.playPause.classList.remove("playing");
    el.playPause.setAttribute("aria-label", "Lire l’animation");
  }

  function togglePlayback() {
    state.playing ? stopPlayback() : startPlayback();
  }

  function bindEvents() {
    el.previous.addEventListener("click", () => { stopPlayback(); step(-1); });
    el.next.addEventListener("click", () => { stopPlayback(); step(1); });
    el.playPause.addEventListener("click", togglePlayback);
    el.speed.addEventListener("change", () => state.playing && scheduleNext());

    el.mobileRange.addEventListener("input", event => {
      stopPlayback();
      selectFrame(Number(event.target.value), {lock: true});
    });

    el.sidebarToggle.addEventListener("click", () => {
      if (matchMedia("(max-width: 850px)").matches) {
        el.player.classList.add("sidebar-open");
      } else {
        const collapsed = el.player.classList.toggle("sidebar-collapsed");
        el.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
      }
    });
    el.sidebarClose.addEventListener("click", () => el.player.classList.remove("sidebar-open"));

    document.addEventListener("keydown", event => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
      if (event.key === "ArrowLeft") { stopPlayback(); step(-1); }
      if (event.key === "ArrowRight") { stopPlayback(); step(1); }
      if (event.key === " ") { event.preventDefault(); togglePlayback(); }
      if (event.key === "Escape") el.player.classList.remove("sidebar-open");
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopPlayback();
    });
  }

  async function init() {
    bindEvents();
    state.manifest = normalizeManifest(await loadManifest());
    renderModels();

    const preferred = localStorage.getItem("meteo-lab-v6-model");
    const firstModel = state.manifest.models[preferred] ? preferred : Object.keys(state.manifest.models)[0];
    selectModel(firstModel);
  }

  init().catch(error => {
    console.error(error);
    el.loader.hidden = true;
    el.error.hidden = false;
    el.error.textContent = "Impossible d’initialiser le lecteur de cartes.";
  });
})();
