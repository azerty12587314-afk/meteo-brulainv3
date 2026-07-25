(() => {
  "use strict";

  const MANIFEST_URL = "./maps/manifest.json";

  const state = {
    manifest: null,
    modelKey: null,
    variableKey: null,
    selectedIndex: 0,
    previewIndex: null,
    playing: false,
    timer: null,
    hoverTimer: null,
    preloadCache: new Map()
  };

  const el = {
    player: document.getElementById("weatherPlayer"),
    sidebar: document.getElementById("weatherSidebar"),
    sidebarToggle: document.getElementById("sidebarToggle"),
    sidebarClose: document.getElementById("sidebarClose"),
    modelTabs: document.getElementById("modelTabs"),
    variableTabs: document.getElementById("variableTabs"),
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
    mobileOutput: document.getElementById("mobileOutput"),
    legend: document.getElementById("mapLegendV6"),
    legendTitle: document.querySelector(".map-legend-v6-name"),
    legendUnit: document.querySelector(".map-legend-v6-unit"),
    legendGradient: document.querySelector(".map-legend-v6-gradient"),
    legendTicks: document.querySelector(".map-legend-v6-ticks"),
    legendUpdated: document.getElementById("legendUpdated"),
    drawerToggles: document.querySelectorAll(".drawer-toggle")
  };

  function requireElements() {
    const optional = new Set(["sidebarToggle", "sidebarClose", "tooltip"]);
    const missing = Object.entries(el)
      .filter(([key, value]) => !value && !optional.has(key))
      .map(([key]) => key);

    if (missing.length) {
      throw new Error(`Éléments HTML manquants : ${missing.join(", ")}`);
    }
  }

  async function loadManifest() {
    const response = await fetch(`${MANIFEST_URL}?v=${Date.now()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} lors du chargement de ${MANIFEST_URL}`);
    }

    return normalizeManifest(await response.json());
  }

  function normalizeManifest(manifest) {
    const output = {
      generatedAt: manifest.generatedAt || new Date().toISOString(),
      models: {}
    };

    Object.entries(manifest.models || {}).forEach(([modelKey, model]) => {
      const variables = {};

      Object.entries(model.variables || {}).forEach(([variableKey, variable]) => {
        const frames = Array.isArray(variable.frames)
          ? variable.frames
              .filter(frame => frame && (frame.image || frame.url))
              .map(frame => ({
                ...frame,
                forecastHour: Number(frame.forecastHour ?? frame.hour ?? 0)
              }))
              .sort((a, b) => a.forecastHour - b.forecastHour)
          : [];

        if (!frames.length) return;

        variables[variableKey] = {
          ...variable,
          label: variable.label || variable.legend?.title || variableKey,
          frames
        };
      });

      if (!Object.keys(variables).length) return;

      output.models[modelKey] = {
        ...model,
        label: model.label || modelKey.toUpperCase(),
        variables
      };
    });

    if (!Object.keys(output.models).length) {
      throw new Error("Le manifeste ne contient aucun modèle exploitable.");
    }

    return output;
  }

  function getModel() {
    return state.manifest?.models?.[state.modelKey] || null;
  }

  function getVariable() {
    return getModel()?.variables?.[state.variableKey] || null;
  }

  function getFrames() {
    return getVariable()?.frames || [];
  }

  function getFrame(index) {
    return getFrames()[index] || null;
  }

  function frameHour(frame) {
    return Number(frame?.forecastHour ?? 0);
  }

  function frameUrl(frame) {
    return frame?.image || frame?.url || "";
  }

  function frameDate(frame) {
    if (frame?.validTime) {
      const parsed = new Date(frame.validTime);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const run = new Date(getModel()?.run || state.manifest.generatedAt);
    return new Date(run.getTime() + frameHour(frame) * 3600000);
  }

  function formatDate(frame) {
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(frameDate(frame));
  }

  function formatRun(value) {
    if (!value) return "";

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";

    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(parsed);
  }

  function renderModels() {
    el.modelTabs.replaceChildren();

    Object.entries(state.manifest.models).forEach(([key, model]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "model-button";
      button.dataset.model = key;
      button.setAttribute("role", "tab");

      const run = formatRun(model.run);

      button.innerHTML = `
        <span class="model-short">${escapeHtml(model.label)}</span>
        <span class="model-resolution">${run ? `Run ${escapeHtml(run)}` : ""}</span>
      `;

      button.addEventListener("click", () => selectModel(key));
      el.modelTabs.appendChild(button);
    });
  }

  function renderVariables() {
    el.variableTabs.replaceChildren();

    Object.entries(getModel().variables).forEach(([key, variable]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "variable-button";
      button.dataset.variable = key;
      button.setAttribute("role", "tab");

      const unit = variable.legend?.unit || "";

      button.innerHTML = `
        <span class="variable-button-label">${escapeHtml(variable.label)}</span>
        ${unit ? `<span class="variable-button-unit">${escapeHtml(unit)}</span>` : ""}
      `;

      button.addEventListener("click", () => selectVariable(key));
      el.variableTabs.appendChild(button);
    });
  }

  function renderTimeline() {
    const frames = getFrames();
    el.timeline.replaceChildren();
    el.frameCount.textContent = `${frames.length} carte${frames.length > 1 ? "s" : ""}`;

    el.mobileRange.max = String(Math.max(0, frames.length - 1));
    el.mobileRange.value = String(state.selectedIndex);

    frames.forEach((frame, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "timeline-button";
      button.dataset.index = String(index);
      button.setAttribute("role", "option");
      button.setAttribute(
        "aria-label",
        `Échéance plus ${frameHour(frame)} heures, valide ${formatDate(frame)}`
      );

      button.innerHTML = `
        <span class="timeline-dot"></span>
        <span class="timeline-label">
          <span class="timeline-hour">+${frameHour(frame)} h</span>
          <span class="timeline-date">${escapeHtml(formatDate(frame))}</span>
        </span>
      `;

      button.addEventListener("pointerenter", () => previewFrame(index, button));
      button.addEventListener("pointerleave", () => cancelPreview(button));
      button.addEventListener("focus", () => previewFrame(index, button));
      button.addEventListener("blur", () => cancelPreview(button));
      button.addEventListener("click", () => selectFrame(index, { lock: true }));

      el.timeline.appendChild(button);
    });

    updateSelectionUI();
  }

  function renderLegend() {
    const legend = getVariable()?.legend;

    if (!legend?.gradient) {
      el.legend.hidden = true;
      return;
    }

    el.legendTitle.textContent = legend.title || getVariable().label;
    el.legendUnit.textContent = legend.unit || "";
    el.legendGradient.style.background = legend.gradient;
    el.legendTicks.replaceChildren();

    const ticks = Array.isArray(legend.ticks) ? legend.ticks : [];
    ticks.forEach((value, index) => {
      const item = document.createElement("span");
      item.textContent = String(value);
      item.style.left = ticks.length > 1 ? `${(index / (ticks.length - 1)) * 100}%` : "50%";
      el.legendTicks.appendChild(item);
    });

    if (el.legendUpdated) {
      const generated = state.manifest?.generatedAt ? new Date(state.manifest.generatedAt) : null;
      el.legendUpdated.textContent = generated && !Number.isNaN(generated.getTime())
        ? `Légende actualisée avec le manifeste du ${new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(generated)}`
        : "Légende issue du manifeste courant";
    }

    el.legend.hidden = false;
  }

  function selectModel(modelKey) {
    if (!state.manifest.models[modelKey]) return;

    stopPlayback();
    state.modelKey = modelKey;
    state.selectedIndex = 0;
    state.previewIndex = null;

    el.modelTabs.querySelectorAll(".model-button").forEach(button => {
      const active = button.dataset.model === modelKey;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    renderVariables();

    const available = Object.keys(getModel().variables);
    const saved = localStorage.getItem(`meteo-lab-v6-variable:${modelKey}`);
    selectVariable(available.includes(saved) ? saved : available[0], { immediate: true });

    localStorage.setItem("meteo-lab-v6-model", modelKey);
  }

  function selectVariable(variableKey, options = {}) {
    if (!getModel()?.variables?.[variableKey]) return;

    stopPlayback();
    state.variableKey = variableKey;
    state.selectedIndex = 0;
    state.previewIndex = null;

    el.variableTabs.querySelectorAll(".variable-button").forEach(button => {
      const active = button.dataset.variable === variableKey;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    renderTimeline();
    renderLegend();
    selectFrame(0, { lock: true, immediate: options.immediate ?? true });
    preloadSequence();

    localStorage.setItem(
      `meteo-lab-v6-variable:${state.modelKey}`,
      variableKey
    );
  }

  function previewFrame(index, button) {
    clearTimeout(state.hoverTimer);

    state.hoverTimer = window.setTimeout(() => {
      const frame = getFrame(index);
      if (!frame) return;

      state.previewIndex = index;

      el.timeline.querySelectorAll(".timeline-button.preview").forEach(item => {
        item.classList.remove("preview");
      });

      button.classList.add("preview");
      showImage(index, { updateSelection: false });

      if (el.tooltip) {
        el.tooltip.hidden = false;
        el.tooltip.textContent =
          `Prévision +${frameHour(frame)} h — ${formatDate(frame)}. Cliquez pour verrouiller.`;
      }
    }, 70);
  }

  function cancelPreview(button) {
    clearTimeout(state.hoverTimer);
    button?.classList.remove("preview");

    if (el.tooltip) el.tooltip.hidden = true;

    if (state.previewIndex !== null) {
      state.previewIndex = null;
      showImage(state.selectedIndex, { updateSelection: false });
    }
  }

  function selectFrame(index, options = {}) {
    const frames = getFrames();
    if (!frames.length) return;

    const safeIndex = Math.max(0, Math.min(index, frames.length - 1));

    if (options.lock) {
      state.selectedIndex = safeIndex;
      state.previewIndex = null;
      updateSelectionUI();
      preloadNeighbours(safeIndex);
    }

    showImage(safeIndex, {
      immediate: Boolean(options.immediate)
    });
  }

  function updateSelectionUI() {
    const frame = getFrame(state.selectedIndex);

    el.timeline.querySelectorAll(".timeline-button").forEach((button, index) => {
      const active = index === state.selectedIndex;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    el.timeline.querySelector(".timeline-button.active")?.scrollIntoView({
      block: "nearest",
      behavior: "smooth"
    });

    el.mobileRange.value = String(state.selectedIndex);

    if (frame) {
      const value = `+${frameHour(frame)} h`;
      el.mobileOutput.value = value;
      el.mobileOutput.textContent = value;
    }
  }

  function showImage(index, options = {}) {
    const model = getModel();
    const variable = getVariable();
    const frame = getFrame(index);

    if (!model || !variable || !frame) return;

    const url = frameUrl(frame);
    el.loader.hidden = false;
    el.error.hidden = true;

    const image = state.preloadCache.get(url) || new Image();
    image.decoding = "async";

    image.onload = () => {
      const alt =
        `${model.label} — ${variable.label} — échéance +${frameHour(frame)} h`;

      if (options.immediate || !el.currentMap.getAttribute("src")) {
        el.currentMap.src = url;
        el.currentMap.alt = alt;
        el.currentLayer.style.opacity = "1";
        el.nextLayer.style.opacity = "0";
      } else {
        el.nextMap.src = url;
        el.nextMap.alt = alt;
        el.nextLayer.style.opacity = "1";
        el.currentLayer.style.opacity = "0";

        window.setTimeout(() => {
          el.currentMap.src = url;
          el.currentMap.alt = alt;
          el.currentLayer.style.opacity = "1";
          el.nextLayer.style.opacity = "0";
        }, 145);
      }

      el.loader.hidden = true;
      el.modelBadge.textContent = model.label;
      el.mapTitle.textContent = variable.label;

      const run = model.run ? `Run ${formatRun(model.run)} • ` : "";
      el.mapMeta.textContent =
        `${run}échéance +${frameHour(frame)} h • valide ${formatDate(frame)}`;
    };

    image.onerror = () => {
      el.loader.hidden = true;
      el.error.hidden = false;
      el.error.textContent =
        `Carte indisponible : ${model.label}, ${variable.label}, +${frameHour(frame)} h.`;
    };

    if (image.src !== new URL(url, document.baseURI).href) image.src = url;
    else if (image.complete && image.naturalWidth) image.onload();
  }

  function preloadSequence() {
    const frames = getFrames();
    const load = () => {
      frames.forEach(frame => {
        const url = frameUrl(frame);
        if (!url || state.preloadCache.has(url)) return;
        const image = new Image();
        image.decoding = "async";
        image.src = url;
        state.preloadCache.set(url, image);
      });
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(load, { timeout: 1800 });
    } else {
      window.setTimeout(load, 180);
    }
  }

  function preloadNeighbours(index) {
    const frames = getFrames();

    [index - 1, index + 1, index + 2].forEach(candidate => {
      const frame = frames[candidate];
      if (!frame) return;

      const url = frameUrl(frame);
      if (!url || state.preloadCache.has(url)) return;

      const image = new Image();
      image.src = url;
      state.preloadCache.set(url, image);

      if (state.preloadCache.size > 18) {
        const firstKey = state.preloadCache.keys().next().value;
        state.preloadCache.delete(firstKey);
      }
    });
  }

  function step(delta) {
    const frames = getFrames();
    if (!frames.length) return;

    const index =
      (state.selectedIndex + delta + frames.length) % frames.length;

    selectFrame(index, { lock: true });
  }

  function startPlayback() {
    if (state.playing || getFrames().length < 2) return;

    state.playing = true;
    el.playPause.textContent = "⏸";
    el.playPause.setAttribute("aria-label", "Mettre en pause");
    scheduleNext();
  }

  function scheduleNext() {
    clearTimeout(state.timer);
    if (!state.playing) return;

    state.timer = window.setTimeout(() => {
      step(1);
      scheduleNext();
    }, Number(el.speed.value || 700));
  }

  function stopPlayback() {
    state.playing = false;
    clearTimeout(state.timer);
    el.playPause.textContent = "▶";
    el.playPause.setAttribute("aria-label", "Lire l’animation");
  }

  function togglePlayback() {
    state.playing ? stopPlayback() : startPlayback();
  }

  function bindEvents() {
    el.previous.addEventListener("click", () => {
      stopPlayback();
      step(-1);
    });

    el.next.addEventListener("click", () => {
      stopPlayback();
      step(1);
    });

    el.playPause.addEventListener("click", togglePlayback);

    el.speed.addEventListener("change", () => {
      if (state.playing) scheduleNext();
    });

    el.mobileRange.addEventListener("input", event => {
      stopPlayback();
      selectFrame(Number(event.target.value), { lock: true });
    });

    el.sidebarToggle?.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 850px)").matches) {
        el.player.classList.add("sidebar-open");
      } else {
        const collapsed = el.player.classList.toggle("sidebar-collapsed");
        el.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
      }
    });

    el.sidebarClose?.addEventListener("click", () => {
      el.player.classList.remove("sidebar-open");
    });

    el.drawerToggles?.forEach(toggle => {
      const section = toggle.closest(".drawer-section");
      const key = section?.dataset.drawer;
      const saved = key ? localStorage.getItem(`meteo-lab-drawer:${key}`) : null;
      if (saved === "closed") {
        section.classList.add("drawer-closed");
        toggle.setAttribute("aria-expanded", "false");
      }
      toggle.addEventListener("click", () => {
        const closed = section.classList.toggle("drawer-closed");
        toggle.setAttribute("aria-expanded", String(!closed));
        if (key) localStorage.setItem(`meteo-lab-drawer:${key}`, closed ? "closed" : "open");
      });
    });

    document.addEventListener("keydown", event => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        return;
      }

      if (event.key === "ArrowLeft") {
        stopPlayback();
        step(-1);
      } else if (event.key === "ArrowRight") {
        stopPlayback();
        step(1);
      } else if (event.key === " ") {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === "Escape") {
        el.player.classList.remove("sidebar-open");
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopPlayback();
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function init() {
    requireElements();
    bindEvents();

    state.manifest = await loadManifest();
    renderModels();

    const modelKeys = Object.keys(state.manifest.models);
    const savedModel = localStorage.getItem("meteo-lab-v6-model");
    selectModel(modelKeys.includes(savedModel) ? savedModel : modelKeys[0]);
  }

  init().catch(error => {
    console.error("Erreur du lecteur météo :", error);
    el.loader.hidden = true;
    el.error.hidden = false;
    el.error.textContent =
      "Impossible d’initialiser le lecteur. Vérifiez ./maps/manifest.json et les chemins des images.";
  });
})();
