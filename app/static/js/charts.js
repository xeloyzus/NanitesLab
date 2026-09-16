/**
 * Shared dashboard helpers + the mobile view.
 * The kiosk (large-TV) view lives in kiosk.js.
 */

/* Display metadata for each metric the backend can produce. */
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

const MOBILE_REFRESH_MS = 60_000;

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

/** Render a building's latest sensor readings into ``container`` (mobile). */
function renderCurrentReadings(container, data) {
  container.innerHTML = "";
  const list = document.createElement("ul");
  list.className = "sensor-list";

  for (const sensor of data.sensors) {
    const readings = Object.entries(sensor.readings)
      .filter(([metric]) => METRICS[metric])
      .map(
        ([metric, value]) =>
          `<span class="metric"><em>${METRICS[metric].label}</em>` +
          `<strong>${formatValue(metric, value)}</strong></span>`
      )
      .join("");

    const item = document.createElement("li");
    item.className = `sensor sensor-${sensor.type}`;
    item.innerHTML =
      `<div class="sensor-head">` +
      `<span>${escapeHtml(sensor.label)}</span>` +
      `<span class="badge">${sensor.type.toUpperCase()}</span>` +
      `</div><div class="metrics">${readings}</div>`;
    list.appendChild(item);
  }

  container.appendChild(list);
}

/** Simplified single-column view (mobile.html): current readings only. */
async function initMobile() {
  const container = document.getElementById("mobile");
  const updated = document.getElementById("updated");

  const refreshAll = async () => {
    try {
      const buildings = await getBuildings();
      container.innerHTML = "";
      for (const building of buildings) {
        const card = document.createElement("section");
        card.className = "building";
        card.innerHTML = `<h2>${escapeHtml(building.name)}</h2><div class="current"></div>`;
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
  setInterval(refreshAll, MOBILE_REFRESH_MS);
}
