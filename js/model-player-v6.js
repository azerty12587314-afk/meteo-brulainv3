(() => {
  "use strict";

  /*
   * Météo Lab V6 — lecteur de cartes compatible avec le manifeste réel :
   *
   * models
   *   └─ gfs / icon_eu / ecmwf
   *        └─ variables
   *             └─ temp2m / mslp / precip / wind10 / z500_mslp
   *                  └─ frames
   *
   * Chaque frame utilise :
   * - forecastHour
   * - validTime
   * - image
   */

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

  function ensureRequiredElements() {
    const missing = Object.entries(el)
      .filter(([key, value]) => !value && !["sidebarToggle", "sidebarClose", "tooltip"].includes(key))
      .map(([key]) => key);

    if (missing.length) {
      throw new Error(
        `Lecteur météo incomplet. Éléments HTML manquants : ${missing.join(", ")}`
      );
    }
  }

  function createVariableSelector() {
    let wrapper = document.getElementById("variableSelectorBlock");

    if (wrapper) {
      return {
        wrapper,
        title: wrapper.querySelector(".variable-heading"),
        tabs: wrapper.querySelector("#variableTabs")
      };
    }

    wrapper = document.createElement("div");
    wrapper.id = "variableSelectorBlock";
    wrapper.className = "variable-selector-block";

    const title = document.createElement("div");
    title.className = "timeline-heading variable-heading";
    title.innerHTML = "<span>Type de carte</span>";

    const tabs = document.createElement("div");
    tabs.id = "variableTabs";
    tabs.className = "variable-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Types de cartes météo");

    wrapper.append(title, tabs);

    const timelineHeading = el.timeline.previousElementSibling;
    el.sidebar.insertBefore(wrapper, timelineHeading);

    return { wrapper, title, tabs };
  }

  const variableUI = createVariableSelector();

  function injectVariableStyles() {
    if (document.getElementById("modelPlayerVariableStyles")) return;

    const style = document.createElement("style");
    style.id = "modelPlayerVariableStyles";
    style.textContent = `
      .variable-selector-block {
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255,255,255,.10);
      }

      .variable-heading {
        padding-top: 14px;
      }

      .variable-tabs {
        display: grid;
        gap: 6px;
        padding: 0 2px 4px;
      }

      .variable-button {
        width: 100%;
        padding: 9px 10px;
        color: inherit;
        background: rgba(255,255,255,.055);
        border: 1px solid transparent;
        border-radius: 10px;
        text-align: left;
        cursor: pointer;
        transition:
          background .16s ease,
          border-color .16s ease,
          transform .16s ease;
      }

      .variable-button:hover {
        background: rgba(85,213,255,.10);
        border-color: rgba(85,213,255,.35);
        transform: translateX(2px);
      }

      .variable-button.active {
        color: #061a27;
        background: linear-gradient(135deg,#55d5ff,#62e0ad);
        font-weight: 800;
      }

      .variable-button-label {
        display: block;
        font-size: .78rem;
        line-height: 1.25;
      }

      .variable-button-unit {
        display: block;
        margin-top: 2px;
        font-size: .64rem;
        opacity: .72;
      }

      .map-legend-v6 {
        position: absolute;
        z-index: 8;
        left: 14px;
        right: 14px;
        bottom: 14px;
        max-width: 720px;
        margin-inline: auto;
        padding: 8px 10px;
        background: rgba(7,19,31,.88);
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 11px;
        backdrop-filter: blur(4px);
        pointer-events: none;
      }

      .map-legend-v6-title {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 6px;
        color: #f5f8fc;
        font-size: .72rem;
        font-weight: 750;
      }

      .map-legend-v6-gradient {
        height: 9px;
        border-radius: 999px;
      }

      .map-legend-v6-ticks {
        display: flex;
        justify-content: space-between;
        gap: 6px;
        margin-top: 4px;
        color: #b6c2d1;
        font-size: .62rem;
      }

      @media (max-width: 850px) {
        .map-legend-v6 {
          left: 8px;
          right: 8px;
          bottom: 8px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function createLegend() {
    let legend = document.getElementById("mapLegendV6");

    if (legend) {
      return {
        root: legend,
        title: legend.querySelector(".map-legend-v6-name"),
        unit: legend.querySelector(".map-legend-v6-unit"),
        gradient: legend.querySelector(".map-legend-v6-gradient"),
        ticks: legend.querySelector(".map-legend-v6-ticks")
      };
    }

    legend = document.createElement("div");
    legend.id = "mapLegendV6";
    legend.className = "map-legend-v6";
    legend.hidden = true;
    legend.innerHTML = `
      <div class="map-legend-v6-title">
        <span class="map-legend-v6-name"></span>
        <span class="map-legend-v6-unit"></span>
      </div>
      <div class="map-legend-v6-gradient"></div>
      <div class="map-legend-v6-ticks"></div>
    `;

    const viewport = document.getElementById("mapViewport");
    viewport?.appendChild(legend);

    return {
      root: legend,
      title: legend.querySelector(".map-legend-v6-name"),
      unit: legend.querySelector(".map-legend-v6-unit"),
      gradient: legend.querySelector(".map-legend-v6-gradient"),
      ticks: legend.querySelector(".map-legend-v6-ticks")
    };
  }

  injectVariableStyles();
  const legendUI = createLegend();

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
    return Number(frame?.forecastHour ?? frame?.hour ?? 0);
  }

  function frameUrl(frame) {
    return frame?.image || frame?.url || "";
  }

  function frameDate(frame) {
    if (frame?.validTime) {
      const parsed = new Date(frame.validTime);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const run = new Date(getModel()?.run || state.manifest?.generatedAt || Date.now());
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

  function formatRun(dateValue) {
    if (!dateValue) return "";

    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return "";

    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(parsed);
  }

  async function loadManifest() {
    const response = await fetch(`${MANIFEST_URL}?v=${Date.now()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Impossible de charger ${MANIFEST_URL} : HTTP ${response.status}`);
    }

    const manifest = await response.json();

    if (!manifest?.models || !Object.keys(manifest.models).length) {
      throw new Error("Le manifeste ne contient aucun modèle.");
    }

    return normalizeManifest(manifest);
  }

  function normalizeManifest(manifest) {
    const normalized = {
      generatedAt: manifest.generatedAt || new Date().toISOString(),
      models: {}
    };

    Object.entries(manifest.models).forEach(([modelKey, model]) => {
      if (!model?.variables) return;

      const variables = {};

      Object.entries(model.variables).forEach(([variableKey, variable]) => {
        const frames = Array.isArray(variable?.frames)
          ? variable.frames
              .filter(frame => frame && frameUrl(frame))
              .map(frame => ({
                ...frame,
                forecastHour: frameHour(frame)
              }))
              .sort((a, b) => a.forecastHour - b.forecastHour)
          : [];

        if (!frames.length) return;

        variables[variableKey] = {
          ...variable,
          label: variable.label || variable.legend?.title || variableKey,
          legend: variable.legend || null,
          frames
        };
      });

      if (!Object.keys(variables).length) return;

      normalized.models[modelKey] = {
        ...model,
        label: model.label || modelKey.toUpperCase(),
        variables
      };
    });

    if (!Object.keys(normalized.models).length) {
      throw new Error("Aucun modèle exploitable dans le manifeste.");
    }

    return normalized;
  }

  function renderModels() {
    el.modelTabs.replaceChildren();

    Object.entries(state.manifest.models).forEach(([key, model]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "model-button";
      button.dataset.model = key;
      button.setAttribute("role", "tab");

      const runLabel = formatRun(model.run);

      button.innerHTML = `
        <span class="model-short">${escapeHtml(model.label)}</span>
        <span class="model-resolution">${runLabel ? `Run ${runLabel}` : ""}</span>
      `;

      button.addEventListener("click", () => selectModel(key));
      el.modelTabs.appendChild(button);
    });
  }

  function renderVariables() {
    const model = getModel();
    variableUI.tabs.replaceChildren();

    Object.entries(model.variables).forEach(([key, variable]) => {
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
      variableUI.tabs.appendChild(button);
    });
  }

  function renderTimeline() {
    const frames = getFrames();
    el.timeline.replaceChildren();
    el.frameCount.textContent = `${frames.length} carte${frames.length > 1 ? "s" : ""}`;

    if (el.mobileRange) {
      el.mobileRange.max = String(Math.max(0, frames.length - 1));
      el.mobileRange.value = String(state.selectedIndex);
    }

    frames.forEach((frame, index) => {
      const hour = frameHour(frame);
      const button = document.createElement("button");

      button.type = "button";
      button.className = "timeline-button";
      button.dataset.index = String(index);
      button.setAttribute("role", "option");
      button.setAttribute(
        "aria-label",
        `Échéance plus ${hour} heures, valide ${formatDate(frame)}`
      );

      button.innerHTML = `
        <span class="timeline-dot"></span>
        <span class="timeline-label">
          <span class="timeline-hour">+${hour} h</span>
          <span class="timeline-date">${escapeHtml(formatDate(frame))}</span>
        </span>
      `;

      button.addEventListener("pointerenter", event => {
        previewFrame(index, event.currentTarget);
      });

      button.addEventListener("pointerleave", event => {
        cancelPreview(event.currentTarget);
      });

      button.addEventListener("focus", event => {
        previewFrame(index, event.currentTarget);
      });

      button.addEventListener("blur", event => {
        cancelPreview(event.currentTarget);
      });

      button.addEventListener("click", () => {
        selectFrame(index, { lock: true });
      });

      el.timeline.appendChild(button);
    });

    updateSelectionUI();
  }

  function renderLegend() {
    const legend = getVariable()?.legend;

    if (!legend || !legend.gradient) {
      legendUI.root.hidden = true;
      return;
    }

    legendUI.title.textContent = legend.title || getVariable()?.label || "";
    legendUI.unit.textContent = legend.unit || "";
    legendUI.gradient.style.background = legend.gradient;
    legendUI.ticks.replaceChildren();

    const ticks = Array.isArray(legend.ticks) ? legend.ticks : [];

    ticks.forEach(value => {
      const span = document.createElement("span");
      span.textContent = String(value);
      legendUI.ticks.appendChild(span);
    });

    legendUI.root.hidden = false;
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

    const savedVariable = localStorage.getItem(`meteo-lab-v6-variable:${modelKey}`);
    const availableVariables = Object.keys(getModel().variables);

    state.variableKey = availableVariables.includes(savedVariable)
      ? savedVariable
      : availableVariables[0];

    selectVariable(state.variableKey, { immediate: true });
    localStorage.setItem("meteo-lab-v6-model", modelKey);
  }

  function selectVariable(variableKey, options = {}) {
    if (!getModel()?.variables?.[variableKey]) return;

    stopPlayback();

    state.variableKey = variableKey;
    state.selectedIndex = 0;
    state.previewIndex = null;

    variableUI.tabs.querySelectorAll(".variable-button").forEach(button => {
      const active = button.dataset.variable === variableKey;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    renderTimeline();
    renderLegend();
    selectFrame(0, { lock: true, immediate: options.immediate ?? true });

    localStorage.setItem(
      `meteo-lab-v6-variable:${state.modelKey}`,
      variableKey
    );
  }

  function previewFrame(index, target) {
    clearTimeout(state.hoverTimer);

    state.hoverTimer = window.setTimeout(() => {
      const frame = getFrame(index);
      if (!frame) return;

      state.previewIndex = index;

      el.timeline
        .querySelectorAll(".timeline-button.preview")
        .forEach(button => button.classList.remove("preview"));

      target.classList.add("preview");

      showImage(index, { updateSelection: false });

      if (el.tooltip) {
        el.tooltip.hidden = false;
        el.tooltip.textContent =
          `Prévision +${frameHour(frame)} h — ${formatDate(frame)}. ` +
          "Cliquer pour verrouiller.";
      }
    }, 60);
  }

  function cancelPreview(target) {
    clearTimeout(state.hoverTimer);
    target?.classList.remove("preview");

    if (el.tooltip) {
      el.tooltip.hidden = true;
    }

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

      if (el.tooltip) {
        el.tooltip.hidden = true;
      }

      updateSelectionUI();
      preloadNeighbours(safeIndex);
    }

    showImage(safeIndex, {
      immediate: Boolean(options.immediate),
      updateSelection: Boolean(options.lock)
    });
  }

  function updateSelectionUI() {
    const frame = getFrame(state.selectedIndex);

    el.timeline.querySelectorAll(".timeline-button").forEach((button, index) => {
      const active = index === state.selectedIndex;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    const selectedButton = el.timeline.querySelector(".timeline-button.active");

    selectedButton?.scrollIntoView({
      block: "nearest",
      behavior: "smooth"
    });

    if (el.mobileRange) {
      el.mobileRange.value = String(state.selectedIndex);
    }

    if (el.mobileOutput && frame) {
      const label = `+${frameHour(frame)} h`;
      el.mobileOutput.value = label;
      el.mobileOutput.textContent = label;
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

    const image = new Image();
    image.decoding = "async";

    image.onload = () => {
      const alt =
        `${model.label} — ${variable.label} — échéance +${frameHour(frame)} h`;

      el.nextMap.src = url;
      el.nextMap.alt = alt;

      if (options.immediate || !el.currentMap.getAttribute("src")) {
        el.currentMap.src = url;
        el.currentMap.alt = alt;
        el.currentLayer.style.opacity = "1";
        el.nextLayer.style.opacity = "0";
        el.loader.hidden = true;
      } else {
        el.nextLayer.style.opacity = "1";
        el.currentLayer.style.opacity = "0";

        window.setTimeout(() => {
          el.currentMap.src = url;
          el.currentMap.alt = alt;
          el.currentLayer.style.opacity = "1";
          el.nextLayer.style.opacity = "0";
          el.loader.hidden = true;
        }, 190);
      }

      el.modelBadge.textContent = model.label;
      el.mapTitle.textContent = variable.label;

      const runText = model.run ? `Run ${formatRun(model.run)} • ` : "";

      el.mapMeta.textContent =
        `${runText}échéance +${frameHour(frame)} h • ` +
        `valide ${formatDate(frame)}`;
    };

    image.onerror = () => {
      el.loader.hidden = true;
      el.error.hidden = false;
      el.error.textContent =
        `Carte indisponible : ${model.label}, ${variable.label}, ` +
        `+${frameHour(frame)} h.`;

      el.mapMeta.textContent =
        `Échéance +${frameHour(frame)} h indisponible`;
    };

    image.src = url;
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

    const nextIndex =
      (state.selectedIndex + delta + frames.length) % frames.length;

    selectFrame(nextIndex, { lock: true });
  }

  function startPlayback() {
    if (state.playing || getFrames().length < 2) return;

    state.playing = true;
    el.playPause.textContent = "⏸";
    el.playPause.classList.add("playing");
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
    el.playPause.classList.remove("playing");
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

    el.mobileRange?.addEventListener("input", event => {
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

    document.addEventListener("keydown", event => {
      if (
        ["INPUT", "SELECT", "TEXTAREA"].includes(
          document.activeElement?.tagName
        )
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        stopPlayback();
        step(-1);
      }

      if (event.key === "ArrowRight") {
        stopPlayback();
        step(1);
      }

      if (event.key === " ") {
        event.preventDefault();
        togglePlayback();
      }

      if (event.key === "Escape") {
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
    ensureRequiredElements();
    bindEvents();

    state.manifest = await loadManifest();
    renderModels();

    const savedModel = localStorage.getItem("meteo-lab-v6-model");
    const modelKeys = Object.keys(state.manifest.models);

    const initialModel = modelKeys.includes(savedModel)
      ? savedModel
      : modelKeys[0];

    selectModel(initialModel);
  }

  init().catch(error => {
    console.error("Erreur du lecteur de cartes :", error);

    if (el.loader) el.loader.hidden = true;

    if (el.error) {
      el.error.hidden = false;
      el.error.textContent =
        "Impossible d’initialiser le lecteur de cartes météo.";
    }
  });
})();
