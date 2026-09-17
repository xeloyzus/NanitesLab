const PULSE_REFRESH_MS = 60_000;

function formatNumber(value, decimals = 0) {
  if (value == null || Number.isNaN(Number(value))) return "--";
  return Number(value).toLocaleString([], {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function formatMetric(metric, decimals = 0) {
  if (!metric || metric.current == null) return "--";
  return `${formatNumber(metric.current, decimals)} ${metric.unit}`;
}

function metricContext(metric) {
  if (!metric || metric.sample_count === 0) return "No 24-hour history yet";
  const direction =
    metric.change_1h == null
      ? "No one-hour trend yet"
      : `${metric.change_1h >= 0 ? "+" : ""}${formatNumber(metric.change_1h, metric.unit === "°C" ? 1 : 0)} ${metric.unit} in 1 h`;
  return `${direction} · ${formatNumber(metric.coverage_24h * 100)}% coverage`;
}

function setCard(id, value, context) {
  const card = document.getElementById(id);
  card.querySelector(".metric-card-value").textContent = value;
  card.querySelector(".metric-card-context").textContent = context;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

function refreshIntervalMs(status) {
  const seconds = Number(status && status.kiosk_refresh_seconds);
  return Number.isFinite(seconds) && seconds >= 10 ? seconds * 1000 : PULSE_REFRESH_MS;
}

function renderDataSource(status) {
  const badge = document.getElementById("data-source-badge");
  if (!badge || !status) return;
  badge.textContent = status.demo_mode ? "Demo data" : "Live sensors";
  badge.className = `freshness-badge ${status.demo_mode ? "delayed" : "current"}`;
}

function freshnessLabel(freshness) {
  if (!freshness) return "Freshness unknown";
  if (freshness.status === "current") return "Current";
  if (freshness.status === "delayed") return "Delayed";
  if (freshness.status === "stale") return "Stale";
  return "Unknown";
}

function renderBuildings(buildings) {
  const grid = document.getElementById("building-grid");
  grid.innerHTML = buildings
    .map((summary) => {
      const recommendation = summary.recommendations[0];
      return `
        <article class="building-pulse-card">
          <div class="building-card-head">
            <h3>${escapeHtml(summary.building.name)}</h3>
            <span class="freshness-badge ${summary.data_quality.freshness.status}">
              ${freshnessLabel(summary.data_quality.freshness)}
            </span>
          </div>
          <div class="building-metrics">
            <span><em>CO2</em><strong>${formatMetric(summary.co2)}</strong></span>
            <span><em>Temperature</em><strong>${formatMetric(summary.temperature, 1)}</strong></span>
            <span><em>Electricity</em><strong>${summary.energy.current_kw == null ? "--" : `${formatNumber(summary.energy.current_kw, 1)} kW`}</strong></span>
          </div>
          <p>${escapeHtml(metricContext(summary.co2))}</p>
          ${
            recommendation
              ? `<div class="mini-recommendation">Possible action · ${escapeHtml(recommendation.verification)}</div>`
              : `<div class="mini-recommendation quiet">No action suggestion from this data slice.</div>`
          }
        </article>
      `;
    })
    .join("");
}

function renderInsights(summary) {
  const feed = document.getElementById("insight-feed");
  const insights = summary.insights.length
    ? summary.insights
    : [{ title: "No notable pattern yet", body: "The dashboard did not detect a meaningful change from this data slice.", severity: "info" }];
  feed.innerHTML = insights
    .map(
      (insight) => `
        <article class="insight-card ${insight.severity}">
          <span>${escapeHtml(insight.severity)}</span>
          <h3>${escapeHtml(insight.title)}</h3>
          <p>${escapeHtml(insight.body)}</p>
        </article>
      `
    )
    .join("");
}

function renderRecommendations(summary) {
  const feed = document.getElementById("recommendation-feed");
  const recommendations = summary.buildings.flatMap((building) => building.recommendations);
  if (!recommendations.length) {
    feed.innerHTML = `
      <article class="insight-card">
        <span>suppressed</span>
        <h3>No recommendation is shown</h3>
        <p>No building currently has enough fresh evidence for an action suggestion.</p>
      </article>
    `;
    return;
  }

  feed.innerHTML = recommendations
    .map(
      (item) => `
        <article class="recommendation-card">
          <span>${escapeHtml(item.confidence)} confidence · ${escapeHtml(item.audience.join(", "))}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.interpretation)}</p>
          <ul>${item.actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>
          <strong>Verify:</strong>
          <p>${escapeHtml(item.verification)}</p>
        </article>
      `
    )
    .join("");
}

async function renderCampusChart(summary, methodology) {
  const bestBuilding = summary.buildings
    .filter((building) => building.co2.source_count > 0)
    .sort((a, b) => (b.co2.current || 0) - (a.co2.current || 0))[0];
  if (!bestBuilding) return;

  const history = await getHistory(bestBuilding.building.id, "24h");
  const data = aggregateMetricHistory(history, "co2", { bucketMinutes: 15 });
  if (!data.length) return;

  renderTimeSeriesChart({
    container: "#co2-chart",
    data,
    metric: { label: `${bestBuilding.building.name} average CO2`, decimals: 0 },
    options: {
      unit: "ppm",
      color: "#276c77",
      includeZero: false,
      smoothingWindow: 3,
      thresholds: methodology.co2_bands || [],
    },
  });

  const values = data.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  document.getElementById("timeline-summary").textContent =
    `${bestBuilding.building.name} CO2 ranged from ${formatNumber(min)} to ${formatNumber(max)} ppm in the selected 24-hour period.`;
}

async function initCampusPulse() {
  let status = null;
  const render = async () => {
    try {
      [status] = await Promise.all([getSystemStatus()]);
      renderDataSource(status);
      const [summary, methodology] = await Promise.all([getCampusSummary(), getMethodology()]);
      document.getElementById("campus-status").textContent =
        summary.co2.current == null
          ? "Campus data is available, but no CO2 aggregate can be calculated yet."
          : `Average campus CO2 is ${formatNumber(summary.co2.current)} ppm across ${summary.co2.source_count} air sensors.`;
      const badge = document.getElementById("freshness-badge");
      badge.textContent = freshnessLabel(summary.data_quality.freshness);
      badge.className = `freshness-badge ${summary.data_quality.freshness.status}`;
      document.getElementById("latest-reading").textContent = summary.data_quality.freshness.description;

      setCard("air-card", formatMetric(summary.co2), metricContext(summary.co2));
      setCard("temperature-card", formatMetric(summary.temperature, 1), metricContext(summary.temperature));
      setCard(
        "energy-card",
        summary.energy.current_kw == null ? "--" : `${formatNumber(summary.energy.current_kw, 1)} kW`,
        summary.energy.method
      );

      renderBuildings(summary.buildings);
      renderInsights(summary);
      renderRecommendations(summary);
      await renderCampusChart(summary, methodology);
    } catch (error) {
      document.getElementById("campus-pulse").innerHTML = `
        <section class="pulse-section">
          <h1>Dashboard unavailable</h1>
          <p class="error">Could not load the Campus Pulse data: ${escapeHtml(error.message)}</p>
          <p>The dashboard is configured for ${status && status.demo_mode ? "demo data" : "live sensor data"} and will recover when the API responds.</p>
        </section>
      `;
    }
  };

  await render();
  setInterval(render, refreshIntervalMs(status));
}
