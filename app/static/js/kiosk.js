/**
 * NanitesLab kiosk (large-TV) dashboard — DOM + rendering.
 * Pure logic lives in kiosk-core.js (KioskCore).
 */

const KIOSK_ROTATE_MS = 25000;
const KIOSK_REFRESH_MS = 5 * 60 * 1000;

const K = window.KioskCore;

let kioskState = null;
let kioskView = 0;
let kioskCharts = [];
let trendsRange = "48h";

/* ---- Data ---- */
async function kioskLoad() {
  const buildings = await getBuildings();
  const items = [];
  for (const b of buildings) {
    const [current, history] = await Promise.all([
      getCurrent(b.id),
      getHistory(b.id, "48h"),
    ]);
    items.push({ building: b, current, history });
  }
  return items;
}

async function kioskRefresh() {
  try {
    kioskState = K.kioskBuild(await kioskLoad());
    await renderAll();
  } catch (err) {
    console.error("Kiosk data load failed:", err);
  }
}

/* ---- Motion: animated numbers ---- */
function animateValue(el, to, decimals, suffix) {
  const duration = 900;
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = to * eased;
    el.textContent = (decimals > 0 ? val.toFixed(decimals) : Math.round(val)) + suffix;
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function animateNumbers(container) {
  for (const el of container.querySelectorAll("[data-value]")) {
    const raw = el.dataset.value;
    const decimals = parseInt(el.dataset.decimals || "0", 10);
    const suffix = el.dataset.suffix || "";
    if (raw === "" || raw == null || Number.isNaN(Number(raw))) {
      el.textContent = "—";
      continue;
    }
    animateValue(el, Number(raw), decimals, suffix);
  }
}

/* ---- Overview ---- */
function renderHero() {
  const el = document.getElementById("hero");
  if (!kioskState || !kioskState.worstBuilding) { el.innerHTML = ""; return; }
  const wb = kioskState.worstBuilding;
  const st = K.co2Status(wb.summary.co2 || 0);
  const dotColor = st.cls === "good" ? "#69db7c" : st.cls === "fair" ? "#ffd43b" : "#ff6b6b";
  const deltas = kioskState.buildings.map((b) => {
    const d = b.summary.co2Delta;
    if (d == null) return "";
    const cls = d > 1 ? "up" : d < -1 ? "down" : "flat";
    return `<span class="delta ${cls}">${escapeHtml(b.building.name)} ${d > 0 ? "+" : ""}${Math.round(d)}</span>`;
  }).join("");
  el.innerHTML =
    `<div class="hero-main">` +
    `<span class="hero-dot" style="background:${dotColor}"></span>` +
    `<span class="hero-status ${st.cls}">${st.label}</span>` +
    `<span class="hero-text">worst air: <strong>${escapeHtml(wb.building.name)}</strong> <strong>${Math.round(wb.summary.co2 || 0)} ppm</strong></span>` +
    `</div>` +
    `<div class="hero-deltas">${deltas}</div>`;
}

function renderOverview() {
  const container = document.querySelector('[data-view="overview"] .buildings');
  container.innerHTML = "";
  for (const { building, summary } of kioskState.buildings) {
    const st = K.co2Status(summary.co2 || 0);
    const card = document.createElement("div");
    card.className = "building" + (summary.stale ? " stale" : "");
    card.innerHTML =
      `<div class="building-name">${escapeHtml(building.name)}</div>` +
      (summary.stale ? `<span class="stale-badge">STALE</span>` : "") +
      K.gaugeSvg(summary.co2) +
      `<div class="status ${st.cls}">${st.label} ${K.trendArrow(summary.co2Series)}</div>` +
      `<div class="kpis">` +
      `<div class="kpi"><span class="val" data-value="${summary.temperature ?? ""}" data-decimals="1" data-suffix="°">—</span><span class="lbl">Temp</span></div>` +
      `<div class="kpi"><span class="val" data-value="${summary.humidity ?? ""}" data-decimals="0" data-suffix="%">—</span><span class="lbl">Humidity</span></div>` +
      `<div class="kpi"><span class="val" data-value="${summary.current}" data-decimals="1" data-suffix=" A">—</span><span class="lbl">Current</span></div>` +
      `</div>` +
      `<canvas class="sparkline"></canvas>`;
    container.appendChild(card);
    renderSparkline(card.querySelector(".sparkline"), summary.co2Series);
  }
  renderOverviewChart();
  animateNumbers(container);
}

function renderSparkline(canvas, series) {
  if (!series || series.length < 2) return;
  const color = K.co2Color(series[series.length - 1].value);
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
    borderColor: K.co2Color(summary.co2 || 0),
    backgroundColor: K.co2Color(summary.co2 || 0),
    borderWidth: 3,
    pointRadius: 0,
    tension: 0.3,
  }));
  kioskCharts.push(new Chart(canvas, { type: "line", data: { datasets }, options: lineChartOptions() }));
}

/* ---- Chart options ---- */
function lineChartOptions() {
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: { legend: { position: "bottom", labels: { color: "#ced4da", font: { size: 14 } } } },
    scales: {
      x: {
        type: "linear",
        ticks: { color: "#868e96", font: { size: 13 }, callback: (v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
        grid: { color: "#2b3442" },
      },
      y: { ticks: { color: "#868e96", font: { size: 13 } }, grid: { color: "#2b3442" } },
    },
  };
}

/* ---- Trends (with range switcher) ---- */
async function getTrendsData() {
  const out = {};
  if (trendsRange === "48h") {
    for (const { building, summary } of kioskState.buildings) {
      out[building.id] = { co2Series: summary.co2Series, tempSeries: summary.tempSeries, humSeries: summary.humSeries };
    }
    return out;
  }
  for (const { building } of kioskState.buildings) {
    const history = await getHistory(building.id, trendsRange);
    out[building.id] = {
      co2Series: K.aggregateSeries(history, "co2"),
      tempSeries: K.aggregateSeries(history, "temperature"),
      humSeries: K.aggregateSeries(history, "humidity"),
    };
  }
  return out;
}

async function renderTrends() {
  const container = document.querySelector('[data-view="trends"] .trends-grid');
  const data = await getTrendsData();
  container.innerHTML = "";
  const panels = [
    { title: "CO₂ (ppm)", key: "co2Series", full: true, colorFn: (s) => K.co2Color(s.co2 || 0) },
    { title: "Temperature (°C)", key: "tempSeries", colorFn: () => "#ff6b6b" },
    { title: "Humidity (%)", key: "humSeries", colorFn: () => "#4dabf7" },
  ];
  for (const panel of panels) {
    const block = document.createElement("div");
    block.className = "trend-panel" + (panel.full ? " trend-full" : "");
    block.innerHTML = `<h3>${panel.title}</h3><div class="chart-wrap"><canvas></canvas></div>`;
    container.appendChild(block);
    const datasets = kioskState.buildings.map(({ building, summary }) => ({
      label: building.name,
      data: ((data[building.id] && data[building.id][panel.key]) || []).map((p) => ({ x: new Date(p.time).getTime(), y: p.value })),
      borderColor: panel.colorFn(summary),
      borderWidth: 3, pointRadius: 0, tension: 0.3,
    }));
    kioskCharts.push(new Chart(block.querySelector("canvas"), { type: "line", data: { datasets }, options: lineChartOptions() }));
  }
}

/* ---- Power ---- */
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
        `<span class="val" data-value="${p.value}" data-decimals="1" data-suffix=" A">—</span></div>`;
    }
    html += `<div class="power-total">Total <span class="num" data-value="${summary.current}" data-decimals="1" data-suffix=" A">—</span> · <span class="num" data-value="${summary.totalAh}" data-decimals="0" data-suffix=" Ah">—</span></div>`;
    panel.innerHTML = html;
    container.appendChild(panel);
  }
  animateNumbers(container);
}

/* ---- Rooms heatmap ---- */
function renderRooms() {
  const container = document.querySelector('[data-view="rooms"] .rooms-grid');
  container.innerHTML = "";
  const rooms = [];
  for (const { current } of kioskState.buildings) {
    for (const s of current.sensors) {
      if (s.type !== "am103") continue;
      rooms.push({ name: s.label, co2: s.readings.co2 ?? null });
    }
  }
  rooms.sort((a, b) => (b.co2 ?? -1) - (a.co2 ?? -1));
  for (const room of rooms) {
    const color = room.co2 == null ? "#2b3442" : K.co2Gradient(room.co2);
    const cell = document.createElement("div");
    cell.className = "room";
    cell.style.setProperty("--room-color", color);
    cell.style.setProperty("--room-bg", room.co2 == null ? "rgba(43,52,66,0.2)" : K.hexToRgba(color, 0.16));
    cell.innerHTML =
      `<span class="room-name">${escapeHtml(room.name)}</span>` +
      `<span class="room-val">${room.co2 == null ? "—" : Math.round(room.co2)}</span>`;
    container.appendChild(cell);
  }
}

/* ---- Ambient theming + status ---- */
function applyAmbient() {
  const color = K.co2Color(kioskState.worst);
  document.documentElement.style.setProperty("--status-color", color);
  document.documentElement.style.setProperty("--status-bg", `linear-gradient(180deg, ${K.hexToRgba(color, 0.14)}, var(--bg) 55%)`);
}

function renderHeaderStatus() {
  const el = document.getElementById("updated");
  const live = document.querySelector(".live");
  if (!el) return;
  const ages = kioskState.buildings.map((b) => b.summary.ageMinutes).filter((a) => a != null);
  if (!ages.length) { el.textContent = ""; el.className = ""; return; }
  const maxAge = Math.max(...ages);
  const stale = maxAge > K.STALE_MINUTES;
  el.textContent = stale ? `Updated ${Math.round(maxAge)}m ago · STALE` : `Updated ${Math.round(maxAge)}m ago`;
  el.className = stale ? "stale" : "fresh";
  if (live) live.classList.toggle("stale", stale);
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

/* ---- Rotation + countdown ---- */
function rotateView() {
  document.querySelectorAll(".view").forEach((v, i) => v.classList.toggle("active", i === kioskView));
  kioskView = (kioskView + 1) % 4;
  const bar = document.getElementById("rotate-progress");
  if (bar) {
    bar.style.transition = "none";
    bar.style.width = "0%";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.transition = `width ${KIOSK_ROTATE_MS}ms linear`;
      bar.style.width = "100%";
    }));
  }
}

/* ---- Day/night dimming + burn-in shift ---- */
function applyDayNight() {
  const hour = new Date().getHours();
  document.body.classList.toggle("night", hour < 7 || hour >= 22);
}

function startBurnInShift() {
  const offsets = [[0, 0], [3, 2], [-3, 2], [2, -3], [0, 0]];
  let i = 0;
  setInterval(() => {
    const [x, y] = offsets[i % offsets.length];
    const kiosk = document.getElementById("kiosk");
    if (kiosk) kiosk.style.transform = `translate(${x}px, ${y}px)`;
    i += 1;
  }, 3 * 60 * 1000);
}

/* ---- Chart lifecycle ---- */
function destroyCharts() {
  for (const c of kioskCharts) c.destroy();
  kioskCharts = [];
}

/* ---- Wiring ---- */
function wireTrendsRange() {
  document.querySelectorAll("[data-trends-range]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll("[data-trends-range]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      trendsRange = btn.dataset.trendsRange;
      await renderAll();
    });
  });
}

async function renderAll() {
  destroyCharts();
  renderHero();
  renderOverview();
  await renderTrends();
  renderPower();
  renderRooms();
  applyAmbient();
  renderHeaderStatus();
  updatePeak();
}

async function initKiosk() {
  document.body.classList.add("kiosk");
  startClock();
  wireTrendsRange();
  applyDayNight();
  setInterval(applyDayNight, 60 * 1000);
  startBurnInShift();
  await kioskRefresh();
  rotateView();
  setInterval(rotateView, KIOSK_ROTATE_MS);
  setInterval(kioskRefresh, KIOSK_REFRESH_MS);
}

