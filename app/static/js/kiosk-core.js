/* NanitesLab kiosk — pure logic (no DOM / Chart / fetch).
 * UMD so it loads as a browser global (`KioskCore`) and in Node (`require`). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KioskCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STALE_MINUTES = 30;

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function avg(nums) {
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  function fmt(value, decimals) {
    if (value == null || Number.isNaN(value)) return "—";
    return Number(value).toFixed(decimals);
  }

  function co2Color(ppm) {
    if (ppm <= 800) return "#00e676";
    if (ppm <= 1200) return "#ffd54f";
    return "#ff3b30";
  }

  function co2Status(ppm) {
    if (ppm <= 800) return { label: "GOOD", cls: "good" };
    if (ppm <= 1200) return { label: "FAIR", cls: "fair" };
    return { label: "POOR", cls: "poor" };
  }

  // Continuous green→amber→red gradient for the heatmap (400–2000 ppm).
  function co2Gradient(ppm) {
    const stops = [[400, [0, 230, 118]], [800, [255, 213, 79]], [1200, [255, 59, 48]], [2000, [255, 59, 48]]];
    const v = clamp(ppm, 400, 2000);
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (v <= b[0]) {
        const t = clamp((v - a[0]) / (b[0] - a[0]), 0, 1);
        const c = a[1].map((n, k) => Math.round(n + (b[1][k] - n) * t));
        return "#" + ((1 << 24) + (c[0] << 16) + (c[1] << 8) + c[2]).toString(16).slice(1);
      }
    }
    return "#ff3b30";
  }

  function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

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

  // avg(last 24h) - avg(previous 24h), for a series spanning ~48h.
  function dayDelta(series) {
    if (!series || series.length < 2) return null;
    const now = Date.now(), day = 86400000;
    const recent = series.filter((p) => new Date(p.time).getTime() >= now - day);
    const prior = series.filter((p) => {
      const t = new Date(p.time).getTime();
      return t >= now - 2 * day && t < now - day;
    });
    if (!recent.length || !prior.length) return null;
    return avg(recent.map((p) => p.value)) - avg(prior.map((p) => p.value));
  }

  function trendArrow(series) {
    if (!series || series.length < 2) return "";
    const first = series[0].value, last = series[series.length - 1].value;
    if (last > first + 1) return "▲";
    if (last < first - 1) return "▼";
    return "→";
  }

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
      const co2Series = aggregateSeries(history, "co2");
      const updated = current.updated ? new Date(current.updated) : null;
      const ageMinutes = updated ? (Date.now() - updated.getTime()) / 60000 : null;
      return {
        building,
        current,
        summary: {
          co2: avg(co2s),
          temperature: avg(temps),
          humidity: avg(hums),
          current: currentSum,
          totalAh,
          co2Series,
          tempSeries: aggregateSeries(history, "temperature"),
          humSeries: aggregateSeries(history, "humidity"),
          co2Delta: dayDelta(co2Series),
          ageMinutes,
          stale: ageMinutes != null && ageMinutes > STALE_MINUTES,
        },
      };
    });
    const worst = Math.max(0, ...buildings.map((b) => b.summary.co2 || 0));
    return {
      buildings,
      worst,
      worstBuilding: buildings.find((b) => (b.summary.co2 || 0) === worst) || null,
    };
  }

  function arcSegment(fracStart, fracEnd) {
    const r = 80, cx = 100, cy = 100;
    const ang = (f) => (1 - f) * Math.PI;
    const pt = (f) => [cx + r * Math.cos(ang(f)), cy - r * Math.sin(ang(f))];
    const p1 = pt(fracStart), p2 = pt(fracEnd);
    return `M ${p1[0]} ${p1[1]} A ${r} ${r} 0 0 1 ${p2[0]} ${p2[1]}`;
  }

  function gaugeSvg(value) {
    const v = value == null ? 0 : value;
    const frac = clamp((v - 400) / (2000 - 400), 0, 1);
    const semicirc = Math.PI * 80;
    const filled = frac * semicirc;
    const zones = [[0, 0.25, "#00e676"], [0.25, 0.5, "#ffd54f"], [0.5, 1, "#ff3b30"]];
    const track = zones.map((z) =>
      `<path d="${arcSegment(z[0], z[1])}" fill="none" stroke="${z[2]}" stroke-width="6" opacity="0.45"/>`
    ).join("");
    return (
      `<svg viewBox="0 0 200 130" class="gauge" aria-hidden="true">` +
      track +
      `<path d="${arcSegment(0, 1)}" fill="none" stroke="${co2Color(v)}" stroke-width="14" stroke-linecap="round" class="gauge-fill" stroke-dasharray="${filled} ${semicirc}"/>` +
      `<text x="100" y="84" class="gauge-value" text-anchor="middle" data-value="${Math.round(v)}">${Math.round(v)}</text>` +
      `<text x="100" y="110" class="gauge-unit" text-anchor="middle">ppm CO₂</text>` +
      `<text x="18" y="126" class="gauge-tick">400</text>` +
      `<text x="182" y="126" class="gauge-tick" text-anchor="end">2000</text>` +
      `</svg>`
    );
  }

  return {
    STALE_MINUTES, clamp, avg, fmt, co2Color, co2Status, co2Gradient, hexToRgba,
    aggregateSeries, dayDelta, trendArrow, kioskBuild, gaugeSvg, arcSegment,
  };
});

