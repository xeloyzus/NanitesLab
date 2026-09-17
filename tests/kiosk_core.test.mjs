/**
 * Node tests for kiosk-core.js (the pure dashboard logic).
 * Run with: node --test tests/kiosk_core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const K = require("../app/static/js/kiosk-core.js");

test("co2Color thresholds", () => {
  assert.equal(K.co2Color(600), "#00e676");
  assert.equal(K.co2Color(900), "#ffd54f");
  assert.equal(K.co2Color(1500), "#ff3b30");
});

test("co2Status buckets", () => {
  assert.deepEqual(K.co2Status(600), { label: "GOOD", cls: "good" });
  assert.deepEqual(K.co2Status(900), { label: "FAIR", cls: "fair" });
  assert.deepEqual(K.co2Status(1500), { label: "POOR", cls: "poor" });
});

test("avg", () => {
  assert.equal(K.avg([2, 4, 6]), 4);
  assert.equal(K.avg([]), null);
});

test("aggregateSeries averages devices at matching timestamps", () => {
  const history = {
    series: [
      { metric: "co2", points: [{ time: "2026-01-01T00:00:00Z", value: 600 }, { time: "2026-01-01T00:15:00Z", value: 800 }] },
      { metric: "co2", points: [{ time: "2026-01-01T00:00:00Z", value: 700 }, { time: "2026-01-01T00:15:00Z", value: 900 }] },
      { metric: "temperature", points: [{ time: "2026-01-01T00:00:00Z", value: 20 }] },
    ],
  };
  assert.deepEqual(K.aggregateSeries(history, "co2"), [
    { time: "2026-01-01T00:00:00Z", value: 650 },
    { time: "2026-01-01T00:15:00Z", value: 850 },
  ]);
});

test("gaugeSvg renders a filled arc + zone track", () => {
  const svg = K.gaugeSvg(1000);
  assert.ok(svg.includes("<svg"), "has svg");
  assert.ok(svg.includes('class="gauge-fill"'), "has fill arc");
  assert.ok(svg.includes("1000"), "shows the value");
  assert.ok(svg.includes("400") && svg.includes("2000"), "shows min/max ticks");
});

test("kioskBuild computes summaries, staleness and worst building", () => {
  const now = new Date().toISOString();
  const mkBuilding = (id, co2, updated) => ({
    building: { id, name: `B${id}`, slug: `b${id}` },
    current: {
      updated,
      sensors: [
        { type: "am103", readings: { co2, temperature: 21, humidity: 40 } },
        { type: "ct305", readings: { current_1: 5, current_2: 6, current_3: 7, total_1: 10, total_2: 11, total_3: 12 } },
      ],
    },
    history: { series: [] },
  });
  const state = K.kioskBuild([
    mkBuilding(1, 700, now),
    mkBuilding(2, 1000, now),
    mkBuilding(3, 900, new Date(Date.now() - 60 * 60000).toISOString()), // 60 min stale
  ]);
  assert.equal(state.buildings.length, 3);
  assert.equal(state.worstBuilding.building.id, 2);
  assert.equal(state.buildings[2].summary.stale, true);
  assert.equal(state.buildings[0].summary.current, 18); // 5+6+7
});
