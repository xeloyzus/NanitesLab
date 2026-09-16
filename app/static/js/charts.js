/**
 * Dashboard rendering (shared by index.html and mobile.html).
 *
 * - METRICS: display metadata for every metric the backend can produce.
 * - initDashboard(): passive multi-building view (index.html).
 * - initMobile(): simplified single-column view (mobile.html).
 */

/* Display metadata: label, unit, colour, and rounding for each metric. */
const METRICS = {
  temperature: { label: "Temperature", unit: "°C",  color: "#ff6b6b", decimals: 1 },
  humidity:    { label: "Humidity",    unit: "%",   color: "#4dabf7", decimals: 0 },
  co2:         { label: "CO₂",         unit: "ppm", color: "#9775fa", decimals: 0 },
  battery:     { label: "Battery",     unit: "%",   color: "#69db7c", decimals: 0 },
  current_1:   { label: "Current L1",  unit: "A",   color: "#ffd43b", decimals: 1 },
  current_2:   { label: "Current L2",  unit: "A",   color: "#ff922b", decimals: 1 },
  current_3:   { label: "Current L3",  unit: "A",   color: "#22b8cf", decimals: 1 },
  total_1:     { label: "Energy L1",   unit: "Ah",  color: "#868e96", decimals: 0 },
  total_2:     { label: "Energy L2",   unit: "Ah",  color: "#adb5bd", decimals: 0 },
  total_3:     { label: "Energy L3",   unit: "Ah",  color: "#ced4da", decimals: 0 },
};

/* Related metrics drawn on one chart (they share a unit/axis). */
const CHART_GROUPS = [
  { title: "Electric current (A)", metrics: ["current_1", "current_2", "current_3"] },
  { title: "Temperature (°C)",     metrics: ["temperature"] },
  { title: "Humidity (%)",         metrics: ["humidity"] },
  { title: "CO₂ (ppm)",            metrics: ["co2"] },
];

const REFRESH_MS = 60_000; // poll interval for the passive display
let currentRange = "24h";

/** Escape text before inserting it into HTML (labels come from the database). */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

/** Format a metric value with its unit and rounding. */
function formatValue(metric, value) {
  const meta = METRICS[metric] || { unit: "", decimals: 1 };
  const decimals = meta.decimals == null ? 1 : meta.decimals;
  const number = Number(value).toFixed(decimals);
  return meta.unit ? `${number} ${meta.unit}` : number;
}

/** Render the latest readings of a building into ``container``. */
function renderCurrentReadings(container, data) {
  container.innerHTML = "";
  const list = document.createElement("ul");
  list.className = "sensor-list";

  for (const sensor of data.sensors) {
    const readings = Object.entries(sensor.readings)
      .filter(([metric]) => METRICS[metric])
      .map(
        ([metric, value]) =>
          `<span class="metric">` +
          `<em>${METRICS[metric].label}</em>` +
          `<strong>${formatValue(metric, value)}</strong>` +
          `</span>`
      )
      .join("");

    const item = document.createElement("li");
    item.className = `sensor sensor-${sensor.type}`;
    item.innerHTML =
      `<div class="sensor-head">` +
      `<span>${escapeHtml(sensor.label)}</span>` +
      `<span class="badge">${sensor.type.toUpperCase()}</span>` +
      `</div>` +
      `<div class="metrics">${readings}</div>`;
    list.appendChild(item);
  }

  container.appendChild(list);
}

/** Build Chart.js line charts for a building's history. */
function renderHistoryCharts(container, history) {
  container.innerHTML = "";

  for (const group of CHART_GROUPS) {
    const datasets = history.series
      .filter((s) => group.metrics.includes(s.metric))
      .map((s) => ({
        label: s.label,
        data: s.points.map((p) => ({ x: new Date(p.time).getTime(), y: p.value })),
        borderColor: METRICS[s.metric].color,
        backgroundColor: METRICS[s.metric].color,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      }));
    if (datasets.length === 0) continue;

    const block = document.createElement("div");
    block.className = "chart-block";
    block.innerHTML =
      `<h3>${group.title}</h3><div class="chart-wrap"><canvas></canvas></div>`;
    container.appendChild(block);

    new Chart(block.querySelector("canvas"), {
      type: "line",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // static kiosk display: avoid unnecessary re-draws
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { color: "#ced4da" } },
        },
        scales: {
          x: {
            type: "linear",
            ticks: { color: "#868e96", callback: timeTick(currentRange) },
            grid: { color: "#343a40" },
          },
          y: {
            ticks: { color: "#868e96" },
            grid: { color: "#343a40" },
          },
        },
      },
    });
  }
}

/** Format x-axis ticks: time-of-day for short ranges, date+time otherwise. */
function timeTick(range) {
  const short = range === "1h" || range === "24h";
  const options = short
    ? { hour: "2-digit", minute: "2-digit" }
    : { month: "2-digit", day: "2-digit", hour: "2-digit" };
  return (value) => new Date(value).toLocaleString([], options);
}

/** Refresh a single building card (current readings + history charts). */
async function refreshBuilding(building, card) {
  const currentBox = card.querySelector(".current");
  const chartsBox = card.querySelector(".charts");
  try {
    renderCurrentReadings(currentBox, await getCurrent(building.id));
  } catch {
    currentBox.innerHTML = `<p class="error">Readings unavailable</p>`;
  }
  try {
    renderHistoryCharts(chartsBox, await getHistory(building.id, currentRange));
  } catch {
    chartsBox.innerHTML = `<p class="error">History unavailable</p>`;
  }
}

/** Build a building card element. */
function buildingCard(building) {
  const card = document.createElement("section");
  card.className = "building";
  card.innerHTML =
    `<h2>${escapeHtml(building.name)}</h2>` +
    `<div class="current"></div>` +
    `<div class="charts"></div>`;
  return card;
}

/**
 * Passive multi-building dashboard (index.html).
 * Renders all buildings, then refreshes on an interval.
 */
async function initDashboard() {
  const container = document.getElementById("dashboard");
  const updated = document.getElementById("updated");

  const refreshAll = async () => {
    try {
      const buildings = await getBuildings();
      container.innerHTML = "";
      for (const building of buildings) {
        const card = buildingCard(building);
        container.appendChild(card);
        await refreshBuilding(building, card);
      }
      updated.textContent = new Date().toLocaleTimeString();
    } catch (err) {
      container.innerHTML = `<p class="error">Could not load dashboard: ${escapeHtml(err.message)}</p>`;
    }
  };

  // Range selector buttons.
  document.querySelectorAll("[data-range]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-range]").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      currentRange = button.dataset.range;
      refreshAll();
    });
  });

  await refreshAll();
  setInterval(refreshAll, REFRESH_MS);
}

/**
 * Simplified single-column view (mobile.html): current readings only.
 */
async function initMobile() {
  const container = document.getElementById("mobile");
  const updated = document.getElementById("updated");

  const refreshAll = async () => {
    try {
      const buildings = await getBuildings();
      container.innerHTML = "";
      for (const building of buildings) {
        const card = buildingCard(building);
        card.querySelector(".charts").remove(); // no charts on mobile
        container.appendChild(card);
        try {
          renderCurrentReadings(card.querySelector(".current"), await getCurrent(building.id));
        } catch {
          card.querySelector(".current").innerHTML = `<p class="error">Readings unavailable</p>`;
        }
      }
      updated.textContent = new Date().toLocaleTimeString();
    } catch (err) {
      container.innerHTML = `<p class="error">Could not load dashboard: ${escapeHtml(err.message)}</p>`;
    }
  };

  await refreshAll();
  setInterval(refreshAll, REFRESH_MS);
}
