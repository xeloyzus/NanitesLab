const KIOSK_DEFAULT_SCENE_MS = 12_000;
const KIOSK_REFRESH_MS = 60_000;
const KIOSK_PRESETS = {
  lobby: { sceneMs: 12_000, density: "balanced" },
  hallway: { sceneMs: 9_000, density: "glance" },
  "small-screen": { sceneMs: 14_000, density: "compact" },
};

function kioskConfig() {
  const params = new URLSearchParams(window.location.search);
  const presetName = params.get("preset") || "lobby";
  const preset = KIOSK_PRESETS[presetName] || KIOSK_PRESETS.lobby;
  const sceneMs = Number(params.get("scene_ms")) || preset.sceneMs || KIOSK_DEFAULT_SCENE_MS;
  return {
    presetName,
    sceneMs,
    density: preset.density,
    building: params.get("building") || params.get("location") || "",
  };
}

function formatNumber(value, decimals = 0) {
  if (value == null || Number.isNaN(Number(value))) return "--";
  return Number(value).toLocaleString([], {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function metricValue(metric, decimals = 0) {
  if (!metric || metric.current == null) return "--";
  return `${formatNumber(metric.current, decimals)} ${metric.unit}`;
}

function metricTrend(metric) {
  if (!metric || metric.change_1h == null) return "Trend unavailable";
  const decimals = metric.unit === "°C" ? 1 : 0;
  return `${metric.change_1h >= 0 ? "+" : ""}${formatNumber(metric.change_1h, decimals)} ${metric.unit} in 1 h`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

function refreshIntervalMs(status) {
  const seconds = Number(status && status.kiosk_refresh_seconds);
  return Number.isFinite(seconds) && seconds >= 10 ? seconds * 1000 : KIOSK_REFRESH_MS;
}

function renderRuntimeStatus(status) {
  const source = document.getElementById("kiosk-source");
  if (!source || !status) return;
  source.textContent = status.demo_mode ? "Demo data" : "Live sensors";
  source.className = status.demo_mode ? "demo" : "live";
}

function renderKioskUnavailable(error, status) {
  const sourceLabel = status && status.demo_mode ? "demo data" : "live sensor data";
  document.getElementById("kiosk-freshness").textContent = "Data unavailable";
  document.getElementById("kiosk-freshness").className = "stale";
  document.getElementById("kiosk-confidence").textContent = "Coverage --";
  document.getElementById("scene-campus-summary").textContent =
    `Waiting for ${sourceLabel}. The display will retry automatically.`;
  document.getElementById("kiosk-co2-context").textContent = error.message;
  document.getElementById("kiosk-temp-context").textContent = "Gateway/API connection will be checked on the next refresh.";
  document.getElementById("kiosk-chart-summary").textContent = "No live chart can be drawn until history data is available.";
  document.getElementById("kiosk-quality-summary").textContent =
    "No current readings are available from the configured data source.";
  document.getElementById("kiosk-updated").textContent = "Latest reading unavailable.";
}

function freshnessText(freshness) {
  if (!freshness) return "Freshness unknown";
  if (freshness.status === "current") return "Current data";
  if (freshness.status === "delayed") return "Delayed data";
  if (freshness.status === "stale") return "Stale data";
  return "Freshness unknown";
}

function freshnessClass(freshness) {
  return freshness?.status || "unknown";
}

function coveragePercent(metric) {
  return formatNumber((metric?.coverage_24h || 0) * 100);
}

function buildingMatches(building, query) {
  if (!query) return false;
  const needle = query.toLowerCase();
  return (
    String(building.building.id) === needle ||
    building.building.slug.toLowerCase() === needle ||
    building.building.name.toLowerCase().includes(needle)
  );
}

function pickLocalBuilding(summary, config) {
  return (
    summary.buildings.find((building) => buildingMatches(building, config.building)) ||
    summary.buildings
      .filter((building) => building.co2.current != null)
      .sort((a, b) => (b.co2.current || 0) - (a.co2.current || 0))[0] ||
    summary.buildings[0]
  );
}

function co2StatusSentence(metric, label = "Campus") {
  if (!metric || metric.current == null) return `${label} CO2 is unavailable.`;
  const trend =
    metric.change_1h == null
      ? "with no reliable one-hour trend yet"
      : metric.change_1h > 25
        ? "and rising"
        : metric.change_1h < -25
          ? "and falling"
          : "and stable";
  if (metric.current >= 1000) return `${label} CO2 is elevated ${trend}.`;
  if (metric.current >= 800) return `${label} CO2 is moderate ${trend}.`;
  return `${label} CO2 is low ${trend}.`;
}

function confidenceSentence(summary) {
  const quality = summary.data_quality;
  const coverage = coveragePercent(summary.co2);
  if (quality.freshness.status === "stale") {
    return `Latest campus data is stale. Current conditions may differ from these readings.`;
  }
  if (quality.freshness.status === "delayed") {
    return `Campus data is delayed, but still useful for recent trends.`;
  }
  return `${quality.active_sensors} sensors reporting · ${coverage}% CO2 coverage · ${quality.freshness.description}`;
}

function updateClock() {
  document.getElementById("kiosk-clock").textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function updateDashboardUrl() {
  const target = document.getElementById("kiosk-dashboard-url");
  if (target) {
    target.textContent = `${window.location.origin}/overview`;
  }
}

function renderKioskSummary(summary) {
  const freshness = summary.data_quality.freshness;
  document.getElementById("kiosk-freshness").textContent = freshnessText(freshness);
  document.getElementById("kiosk-freshness").className = freshnessClass(freshness);
  document.getElementById("kiosk-confidence").textContent =
    `${summary.data_quality.active_sensors} sensors · ${coveragePercent(summary.co2)}% coverage`;
  document.getElementById("kiosk-updated").textContent = freshness.description;
  document.getElementById("scene-campus-summary").textContent =
    summary.co2.current == null
      ? "No current campus CO2 aggregate is available yet."
      : `${co2StatusSentence(summary.co2)} Average is ${formatNumber(summary.co2.current)} ppm across ${summary.co2.source_count} reporting air sensors.`;

  document.getElementById("kiosk-co2").textContent = metricValue(summary.co2);
  document.getElementById("kiosk-co2-context").textContent =
    `${metricTrend(summary.co2)} · ${formatNumber(summary.co2.coverage_24h * 100)}% 24 h coverage`;
  document.getElementById("kiosk-temp").textContent = metricValue(summary.temperature, 1);
  document.getElementById("kiosk-temp-context").textContent =
    `${metricTrend(summary.temperature)} · ${formatNumber(summary.temperature.coverage_24h * 100)}% 24 h coverage`;
  document.getElementById("kiosk-energy").textContent =
    summary.energy.current_kw == null ? "--" : `${formatNumber(summary.energy.current_kw, 1)} kW`;
}

function renderLocalFocus(summary, config) {
  const building = pickLocalBuilding(summary, config);
  if (!building) return;

  const isConfigured = Boolean(config.building);
  document.getElementById("scene-local-title").textContent = isConfigured
    ? "This building now"
    : "Highest CO2 now";
  document.getElementById("kiosk-local-summary").textContent =
    `${co2StatusSentence(building.co2, building.building.name)} Latest average is ${metricValue(building.co2)}.`;

  const recommendation = building.recommendations[0];
  document.getElementById("kiosk-local-card").innerHTML = `
    <article class="kiosk-focus-card">
      <span class="kiosk-badge ${freshnessClass(building.data_quality.freshness)}">${escapeHtml(freshnessText(building.data_quality.freshness))}</span>
      <h3>${escapeHtml(building.building.name)}</h3>
      <div class="kiosk-focus-values">
        <strong>${metricValue(building.co2)}</strong>
        <span>${escapeHtml(metricTrend(building.co2))}</span>
      </div>
      <p>${recommendation ? escapeHtml(recommendation.verification) : "No action suggestion from this data slice."}</p>
    </article>
  `;
}

function renderKioskBuildings(summary) {
  const grid = document.getElementById("kiosk-building-grid");
  grid.innerHTML = summary.buildings
    .map((building) => {
      const recommendation = building.recommendations[0];
      const freshness = building.data_quality.freshness;
      const action = recommendation
        ? `Possible action: ${recommendation.verification}`
        : "No action suggestion from this data slice.";
      return `
        <article class="kiosk-building-card">
          <div>
            <h3>${escapeHtml(building.building.name)}</h3>
            <span class="kiosk-badge ${freshness.status}">${escapeHtml(freshnessText(freshness))}</span>
          </div>
          <div class="kiosk-building-values">
            <span>CO2<strong>${metricValue(building.co2)}</strong></span>
            <span>Temp<strong>${metricValue(building.temperature, 1)}</strong></span>
            <span>Energy<strong>${building.energy.current_kw == null ? "--" : `${formatNumber(building.energy.current_kw, 1)} kW`}</strong></span>
          </div>
          <p>${escapeHtml(metricTrend(building.co2))} · ${formatNumber(building.co2.coverage_24h * 100)}% coverage</p>
          <p>${escapeHtml(action)}</p>
        </article>
      `;
    })
    .join("");
}

function renderCampusMap(summary) {
  const buildings = [...summary.buildings]
    .filter((building) => building.co2.current != null)
    .sort((a, b) => (b.co2.current || 0) - (a.co2.current || 0));
  const highest = buildings[0];
  document.getElementById("kiosk-map-summary").textContent = highest
    ? `${highest.building.name} has the highest current CO2 average.`
    : "Building comparison is unavailable until CO2 readings arrive.";

  const max = Math.max(...buildings.map((building) => building.co2.current || 0), 1);
  document.getElementById("kiosk-campus-map").innerHTML = buildings
    .map((building, index) => {
      const level = Math.max(18, Math.round(((building.co2.current || 0) / max) * 100));
      const tone = building.co2.current >= 1000 ? "attention" : building.co2.current >= 800 ? "watch" : "good";
      return `
        <article class="kiosk-map-building ${tone}">
          <div class="kiosk-map-bar" style="height: ${level}%"></div>
          <span>${index + 1}</span>
          <h3>${escapeHtml(building.building.name)}</h3>
          <strong>${metricValue(building.co2)}</strong>
          <em>${escapeHtml(freshnessText(building.data_quality.freshness))}</em>
        </article>
      `;
    })
    .join("");
}

function renderDataQuality(summary) {
  const quality = summary.data_quality;
  const title = document.getElementById("scene-quality-title");
  const label = document.querySelector('[data-scene="data-quality"] .scene-label');
  if (quality.freshness.status === "stale") {
    label.textContent = "Data delay";
    title.textContent = "Readings may be old";
  } else if (quality.freshness.status === "delayed") {
    label.textContent = "Data delay";
    title.textContent = "Use as recent context";
  } else {
    label.textContent = "Trust the data";
    title.textContent = "Data confidence";
  }

  document.getElementById("kiosk-quality-summary").textContent = confidenceSentence(summary);
  document.getElementById("kiosk-quality-list").innerHTML = `
    <span><strong>${summary.data_quality.active_sensors}</strong> reporting sensors</span>
    <span><strong>${summary.data_quality.stale_sensors}</strong> stale sensors</span>
    <span><strong>${coveragePercent(summary.co2)}%</strong> CO2 coverage</span>
    <span><strong>${escapeHtml(freshnessText(quality.freshness))}</strong> freshness</span>
  `;
}

function renderKioskInsight(summary) {
  const insight = summary.insights[0];
  document.getElementById("kiosk-insight").textContent = insight
    ? `${insight.title}. ${insight.body}`
    : "No meaningful campus pattern has been detected from the current data slice.";
}

function renderKioskAction(summary) {
  const recommendation = summary.buildings.flatMap((building) => building.recommendations)[0];
  const audienceGrid = document.getElementById("kiosk-action-audiences");
  if (!recommendation) {
    document.getElementById("kiosk-action").textContent =
      "No recommendation is shown because current evidence is insufficient or conditions are not elevated.";
    document.getElementById("kiosk-verify").textContent = "";
    audienceGrid.innerHTML = "";
    return;
  }

  document.getElementById("kiosk-action").textContent =
    `${recommendation.title}. ${recommendation.interpretation}`;
  document.getElementById("kiosk-verify").textContent = `Verify: ${recommendation.verification}`;
  const studentActions = recommendation.actions.filter((action) => /student/i.test(action));
  const facilitiesActions = recommendation.actions.filter((action) => /facilit/i.test(action));
  audienceGrid.innerHTML = `
    <article>
      <span>For students</span>
      <p>${escapeHtml(studentActions[0] || "Use another study area if the room feels crowded or uncomfortable.")}</p>
    </article>
    <article>
      <span>For facilities</span>
      <p>${escapeHtml(facilitiesActions[0] || "Review this pattern if it recurs during comparable periods.")}</p>
    </article>
  `;
}

async function renderKioskChart(summary, methodology) {
  const selected = summary.buildings
    .filter((building) => building.co2.source_count > 0)
    .sort((a, b) => (b.co2.current || 0) - (a.co2.current || 0))[0];
  if (!selected) return;

  const history = await getHistory(selected.building.id, "24h");
  const data = aggregateMetricHistory(history, "co2", { bucketMinutes: 15 });
  if (!data.length) return;

  const latest = data[data.length - 1];
  const peak = data.reduce((best, point) => (point.value > best.value ? point : best), data[0]);

  renderTimeSeriesChart({
    container: "#kiosk-co2-chart",
    data,
    metric: { label: `${selected.building.name} average CO2`, decimals: 0 },
    options: {
      height: Math.max(420, Math.round(window.innerHeight * 0.56)),
      margin: { top: 22, right: 36, bottom: 54, left: 138 },
      unit: "ppm",
      color: "#246b73",
      includeZero: false,
      smoothingWindow: 5,
      strokeWidth: 4,
      thresholds: methodology.co2_bands || [],
      annotations: [
        { type: "point", label: `Now ${formatNumber(latest.value)} ppm`, time: latest.time, value: latest.value, dy: 34 },
        { type: "point", label: `Peak ${formatNumber(peak.value)} ppm`, time: peak.time, value: peak.value, dy: -22 },
        { type: "threshold", label: "Reference", value: methodology.co2_reference_ppm },
      ],
    },
  });

  const values = data.map((point) => point.value);
  document.getElementById("kiosk-chart-summary").textContent =
    `${selected.building.name} ranged from ${formatNumber(Math.min(...values))} to ${formatNumber(Math.max(...values))} ppm in the last 24 hours.`;
}

function startSceneRotation(config) {
  const scenes = Array.from(document.querySelectorAll(".kiosk-scene"));
  const progress = document.getElementById("kiosk-progress-fill");
  let index = 0;
  let started = Date.now();

  const show = (nextIndex) => {
    scenes[index].classList.remove("active");
    index = nextIndex % scenes.length;
    scenes[index].classList.add("active");
    started = Date.now();
  };

  setInterval(() => {
    const elapsed = Date.now() - started;
    progress.style.width = `${Math.min(100, (elapsed / config.sceneMs) * 100)}%`;
    if (elapsed >= config.sceneMs) {
      progress.style.width = "0";
      show(index + 1);
    }
  }, 250);
}

async function loadKioskData(config) {
  const [summary, methodology] = await Promise.all([getCampusSummary(), getMethodology()]);
  renderKioskSummary(summary);
  renderLocalFocus(summary, config);
  renderKioskBuildings(summary);
  renderCampusMap(summary);
  renderDataQuality(summary);
  renderKioskInsight(summary);
  renderKioskAction(summary);
  await renderKioskChart(summary, methodology);
}

async function initKioskPulse() {
  const config = kioskConfig();
  document.getElementById("kiosk-pulse").dataset.preset = config.presetName;
  document.getElementById("kiosk-pulse").dataset.density = config.density;
  updateClock();
  updateDashboardUrl();
  setInterval(updateClock, 15_000);
  startSceneRotation(config);

  let status = null;
  try {
    status = await getSystemStatus();
    renderRuntimeStatus(status);
    await loadKioskData(config);
  } catch (error) {
    renderKioskUnavailable(error, status);
  }

  setInterval(async () => {
    try {
      status = await getSystemStatus();
      renderRuntimeStatus(status);
      await loadKioskData(config);
    } catch (error) {
      renderKioskUnavailable(error, status);
    }
  }, refreshIntervalMs(status));
}
