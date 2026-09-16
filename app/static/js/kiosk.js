/**
 * NanitesLab kiosk (large-TV) dashboard.
 *
 * Four rotating views (Overview / Trends / Power / Rooms) plus ambient
 * whole-screen colouring driven by the worst CO₂ reading. Data is fetched
 * once and refreshed periodically.
 */

const KIOSK_ROTATE_MS = 25000;
const KIOSK_REFRESH_MS = 5 * 60 * 1000;

let kioskState = null;
let kioskView = 0;
let kioskCharts = [];

/* ---- CO₂ thresholds / colour ---- */
function co2Color(ppm) {
  if (ppm <= 800) return "#69db7c";
  if (ppm <= 1200) return "#ffd43b";
  return "#ff6b6b";
}
function co2Status(ppm) {
  if (ppm <= 800) return { label: "GOOD", cls: "good" };
  if (ppm <= 1200) return { label: "FAIR", cls: "fair" };
  return { label: "POOR", cls: "poor" };
}

/* ---- Small helpers ---- */
function avg(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function fmt(value, decimals) {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toFixed(decimals);
}
function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/* ---- Data ---- */
async function kioskLoad() {
  const buildings = await getBuildings();
  const items = [];
  for (const b of buildings) {
    const [current, history] = await Promise.all([
      getCurrent(b.id),
      getHistory(b.id, "24h"),
    ]);
    items.push({ building: b, current, history });
  }
  return items;
}

/** Average a per-device metric series into one building-level series. */
function aggregateSeries(history, metric) {
  const byTime = new Map();
  for (const s of history.series) {
    if (s.metric !== metric) continue;
    for (const p of s.points) {
      if (!byTime.has(p.time)) byTime.set(p.time, []);
      byTime.get(p.time).push(p.value);
    }
  }
  return [...byTime.entries()]
    .map(([time, values]) => ({ time, value: avg(values) }))
    .sort((a, b) => new Date(a.time) - new Date(b.time));
}

/** Build the in-memory state used by every view. */
function kioskBuild(items) {
  const buildings = items.map(({ building, current, history }) => {
    const co2s = [], temps = [], hums = [];
    let currentSum = 0, totalAh = 0;
    for (const s of current.sensors) {
      const r = s.readings;
      if (s.type === "am103") {
        if (r.co2 != null) co2s.push(r.co2);
        if (r.temperature != null) temps.push(r.temperature);
        if (r.humidity != null) hums.push(r.humidity);
      } else if (s.type === "ct305") {
        currentSum += (r.current_1 || 0) + (r.current_2 || 0) + (r.current_3 || 0);
        totalAh += (r.total_1 || 0) + (r.total_2 || 0) + (r.total_3 || 0);
      }
    }
    return {
      building,
      current,
      summary: {
        co2: avg(co2s),
        temperature: avg(temps),
        humidity: avg(hums),
        current: currentSum,
        totalAh,
        co2Series: aggregateSeries(history, "co2"),
        tempSeries: aggregateSeries(history, "temperature"),
      },
    };
  });
  const worst = Math.max(0, ...buildings.map((b) => b.summary.co2 || 0));
  return { buildings, worst };
}

/* ---- Radial gauge (inline SVG) ---- */
function gaugeSvg(value) {
  const v = value == null ? 0 : value;
  const min = 400, max = 2000, r = 80;
  const semicirc = Math.PI * r;
  const frac = Math.min(1, Math.max(0, (v - min) / (max - min)));
  const color = co2Color(v);
  const filled = frac * semicirc;
  const arc = "M 20 100 A 80 80 0 0 1 180 100";
  return (
    `<svg viewBox="0 0 200 124" class="gauge" aria-hidden="true">` +
    `<path d="${arc}" fill="none" stroke="#2b3442" stroke-width="14" stroke-linecap="round"/>` +
    `<path d="${arc}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round" ` +
    `stroke-dasharray="${filled} ${semicirc}"/>` +
    `<text x="100" y="86" class="gauge-value" text-anchor="middle">${Math.round(v)}</text>` +
    `<text x="100" y="112" class="gauge-unit" text-anchor="middle">ppm CO₂</text>` +
    `</svg>`
  );
}

function trendArrow(series) {
  if (!series || series.length < 2) return "";
  const first = series[0].value;
  const last = series[series.length - 1].value;
  if (last > first + 1) return "▲";
  if (last < first - 1) return "▼";
  return "→";
}

/* ---- Shared line-chart options ---- */
function lineChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: { position: "bottom", labels: { color: "#ced4da", font: { size: 14 } } },
    },
    scales: {
      x: {
        type: "linear",
        ticks: {
          color: "#868e96",
          font: { size: 13 },
          callback: (v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
        grid: { color: "#2b3442" },
      },
      y: { ticks: { color: "#868e96", font: { size: 13 } }, grid: { color: "#2b3442" } },
    },
  };
}

/* ---- View renderers ---- */
function renderOverview() {
  const container = document.querySelector('[data-view="overview"] .buildings');
  container.innerHTML = "";
  for (const { building, summary } of kioskState.buildings) {
    const st = co2Status(summary.co2 || 0);
    const card = document.createElement("div");
    card.className = "building";
    card.innerHTML =
      `<div class="building-name">${escapeHtml(building.name)}</div>` +
      gaugeSvg(summary.co2) +
      `<div class="status ${st.cls}">${st.label} ${trendArrow(summary.co2Series)}</div>` +
      `<div class="kpis">` +
      `<div class="kpi"><span class="val">${fmt(summary.temperature, 1)}°</span><span class="lbl">Temp</span></div>` +
      `<div class="kpi"><span class="val">${fmt(summary.humidity, 0)}%</span><span class="lbl">Humidity</span></div>` +
      `<div class="kpi"><span class="val">${fmt(summary.current, 1)} A</span><span class="lbl">Current</span></div>` +
      `</div>` +
      `<canvas class="sparkline"></canvas>`;
    container.appendChild(card);
    renderSparkline(card.querySelector(".sparkline"), summary.co2Series);
  }
  renderOverviewChart();
}

function renderSparkline(canvas, series) {
  if (!series || series.length < 2) return;
  const color = co2Color(series[series.length - 1].value);
  kioskCharts.push(new Chart(canvas, {
    type: "line",
    data: {
      labels: series.map((p) => p.time),
      datasets: [{ data: series.map((p) => p.value), borderColor: color, borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
    },
  }));
}

function renderOverviewChart() {
  const canvas = document.getElementById("overview-chart-canvas");
  const datasets = kioskState.buildings.map(({ building, summary }) => ({
    label: building.name,
    data: (summary.co2Series || []).map((p) => ({ x: new Date(p.time).getTime(), y: p.value })),
    borderColor: co2Color(summary.co2 || 0),
    backgroundColor: co2Color(summary.co2 || 0),
    borderWidth: 3,
    pointRadius: 0,
    tension: 0.3,
  }));
  kioskCharts.push(new Chart(canvas, { type: "line", data: { datasets }, options: lineChartOptions() }));
}

function renderTrends() {
  const container = document.querySelector('[data-view="trends"] .trends-grid');
  container.innerHTML = "";
  const panels = [
    { title: "CO₂ (ppm)", key: "co2Series", colorFn: (s) => co2Color(s.co2 || 0) },
    { title: "Temperature (°C)", key: "tempSeries", colorFn: () => "#ff6b6b" },
  ];
  for (const panel of panels) {
    const block = document.createElement("div");
    block.className = "trend-panel";
    block.innerHTML = `<h3>${panel.title}</h3><div class="chart-wrap"><canvas></canvas></div>`;
    container.appendChild(block);
    const datasets = kioskState.buildings.map(({ building, summary }) => ({
      label: building.name,
      data: (summary[panel.key] || []).map((p) => ({ x: new Date(p.time).getTime(), y: p.value })),
      borderColor: panel.colorFn(summary),
      borderWidth: 3,
      pointRadius: 0,
      tension: 0.3,
    }));
    kioskCharts.push(new Chart(block.querySelector("canvas"), { type: "line", data: { datasets }, options: lineChartOptions() }));
  }
}

function phaseValue(current, metric) {
  const ct = (current.sensors || []).find((s) => s.type === "ct305");
  return ct && ct.readings[metric] != null ? ct.readings[metric] : 0;
}

function renderPower() {
  const container = document.querySelector('[data-view="power"] .power-grid');
  container.innerHTML = "";
  for (const { building, current, summary } of kioskState.buildings) {
    const phases = [
      { label: "L1", value: phaseValue(current, "current_1"), color: "#ffd43b" },
      { label: "L2", value: phaseValue(current, "current_2"), color: "#ff922b" },
      { label: "L3", value: phaseValue(current, "current_3"), color: "#22b8cf" },
    ];
    const max = Math.max(1, ...phases.map((p) => p.value));
    const panel = document.createElement("div");
    panel.className = "power-panel";
    let html = `<h3>${escapeHtml(building.name)}</h3>`;
    for (const p of phases) {
      html +=
        `<div class="phase"><span class="lbl">${p.label}</span>` +
        `<div class="bar-track"><div class="bar" style="width:${Math.round((p.value / max) * 100)}%;background:${p.color}"></div></div>` +
        `<span class="val">${fmt(p.value, 1)} A</span></div>`;
    }
    html += `<div class="power-total">Total <span class="num">${fmt(summary.current, 1)} A</span> · <span class="num">${fmt(summary.totalAh, 0)} Ah</span></div>`;
    panel.innerHTML = html;
    container.appendChild(panel);
  }
}

function renderRooms() {
  const container = document.querySelector('[data-view="rooms"] .rooms-grid');
  container.innerHTML = "";
  for (const { current } of kioskState.buildings) {
    for (const s of current.sensors) {
      if (s.type !== "am103") continue;
      const co2 = s.readings.co2;
      const color = co2Color(co2 || 0);
      const cell = document.createElement("div");
      cell.className = "room";
      cell.style.setProperty("--room-color", color);
      cell.innerHTML =
        `<span class="room-name">${escapeHtml(s.label)}</span>` +
        `<span class="room-val">${co2 == null ? "—" : Math.round(co2)}</span>`;
      container.appendChild(cell);
    }
  }
}

/* ---- Ambient theming + footer ---- */
function applyAmbient() {
  const color = co2Color(kioskState.worst);
  document.documentElement.style.setProperty("--status-color", color);
  document.documentElement.style.setProperty(
    "--status-bg",
    `linear-gradient(180deg, ${hexToRgba(color, 0.14)}, var(--bg) 55%)`
  );
}

function updatePeak() {
  let worst = { label: "", value: 0 };
  for (const { current } of kioskState.buildings) {
    for (const s of current.sensors) {
      if (s.type === "am103" && (s.readings.co2 || 0) > worst.value) {
        worst = { label: s.label, value: s.readings.co2 };
      }
    }
  }
  const el = document.getElementById("peak");
  if (el) el.textContent = worst.value ? `Peak right now — ${worst.label}: ${Math.round(worst.value)} ppm` : "";
}

/* ---- Clock ---- */
function startClock() {
  const timeEl = document.getElementById("clock-time");
  const dateEl = document.getElementById("clock-date");
  const tick = () => {
    const now = new Date();
    if (timeEl) timeEl.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (dateEl) dateEl.textContent = now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  };
  tick();
  setInterval(tick, 1000);
}

/* ---- Rotation ---- */
function rotateView() {
  document.querySelectorAll(".view").forEach((v, i) => {
    v.classList.toggle("active", i === kioskView);
  });
  kioskView = (kioskView + 1) % 4;
}

function destroyCharts() {
  for (const c of kioskCharts) c.destroy();
  kioskCharts = [];
}

function renderAll() {
  destroyCharts();
  renderOverview();
  renderTrends();
  renderPower();
  renderRooms();
  applyAmbient();
  updatePeak();
}

/* ---- Entry point ---- */
async function kioskRefresh() {
  try {
    kioskState = kioskBuild(await kioskLoad());
    renderAll();
  } catch (err) {
    console.error("Kiosk data load failed:", err);
  }
}

async function initKiosk() {
  document.body.classList.add("kiosk");
  startClock();
  await kioskRefresh();
  rotateView();
  setInterval(rotateView, KIOSK_ROTATE_MS);
  setInterval(kioskRefresh, KIOSK_REFRESH_MS);
}

