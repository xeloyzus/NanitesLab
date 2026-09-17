/**
 * Thin HTTP client for the NanitesLab API.
 * The dashboard is served by Caddy on the same origin, so all URLs are relative.
 */

const API_BASE = "/api";

/** GET a JSON endpoint, throwing on non-2xx responses. */
async function getJSON(path) {
  const response = await fetch(API_BASE + path, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload.detail ? `: ${payload.detail}` : "";
    } catch {
      detail = "";
    }
    throw new Error(`API ${path} failed (${response.status})${detail}`);
  }
  return response.json();
}

/** List all buildings. */
function getBuildings() {
  return getJSON("/buildings");
}

/** Latest readings for every sensor in a building. */
function getCurrent(buildingId) {
  return getJSON(`/buildings/${buildingId}/current`);
}

/** Downsampled history for a building (range: "1h" | "24h" | "7d" | "30d"). */
function getHistory(buildingId, range) {
  return getJSON(`/buildings/${buildingId}/history?range=${encodeURIComponent(range)}`);
}

/** Campus-level analytics summary for the student overview. */
function getCampusSummary() {
  return getJSON("/campus/summary");
}

/** Building-level analytics summary with statistics, insights, and actions. */
function getBuildingSummary(buildingId) {
  return getJSON(`/buildings/${buildingId}/summary`);
}

/** Transparent methodology/configuration used by recommendation rules. */
function getMethodology() {
  return getJSON("/methodology");
}

/** Runtime mode and data-source status for deployment and kiosk diagnostics. */
function getSystemStatus() {
  return getJSON("/system/status");
}

function bucketTimestamp(time, bucketMinutes = 15) {
  const date = time instanceof Date ? time : new Date(time);
  if (Number.isNaN(date.getTime())) return null;
  const bucketMs = bucketMinutes * 60 * 1000;
  return new Date(Math.round(date.getTime() / bucketMs) * bucketMs).toISOString();
}

function aggregateMetricHistory(history, metric, options = {}) {
  const buckets = new Map();
  const bucketMinutes = options.bucketMinutes || 15;

  for (const series of (history.series || []).filter((item) => item.metric === metric)) {
    for (const point of series.points || []) {
      const key = bucketTimestamp(point.time, bucketMinutes);
      const value = Number(point.value);
      if (!key || !Number.isFinite(value)) continue;
      const values = buckets.get(key) || [];
      values.push(value);
      buckets.set(key, values);
    }
  }

  return Array.from(buckets.entries())
    .map(([time, values]) => ({
      time,
      value: values.reduce((sum, value) => sum + value, 0) / values.length,
    }))
    .sort((a, b) => new Date(a.time) - new Date(b.time));
}
