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
    throw new Error(`API ${path} failed (${response.status})`);
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
