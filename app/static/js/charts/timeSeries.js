/**
 * Reusable D3 time-series chart.
 *
 * Data fetching stays outside this module. It accepts already-normalized rows:
 * [{ time: Date|string, value: number }]
 */

function renderTimeSeriesChart({ container, data, metric, options = {} }) {
  const root = typeof container === "string" ? document.querySelector(container) : container;
  if (!root) return;

  root.innerHTML = "";
  const rows = data
    .map((point) => ({
      time: point.time instanceof Date ? point.time : new Date(point.time),
      value: Number(point.value),
    }))
    .filter((point) => !Number.isNaN(point.time.getTime()) && Number.isFinite(point.value))
    .sort((a, b) => a.time - b.time);

  if (!rows.length) {
    root.innerHTML = `<div class="chart-empty">No data is available for this chart.</div>`;
    return;
  }

  const width = Math.max(root.clientWidth || 720, 320);
  const height = options.height || 340;
  const margin = options.margin || { top: 22, right: 28, bottom: 42, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const unit = options.unit || "";
  const thresholds = options.thresholds || [];
  const annotations = options.annotations || [];
  const displayRows = smoothRows(rows, options.smoothingWindow || 1);

  const svg = d3
    .select(root)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%")
    .attr("height", height)
    .attr("role", "presentation");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const x = d3.scaleTime().domain(d3.extent(rows, (d) => d.time)).range([0, innerWidth]);
  const annotationValues = annotations
    .map((annotation) => Number(annotation.value))
    .filter((value) => Number.isFinite(value));
  const yValues = displayRows.map((point) => point.value).concat(annotationValues);
  const maxValue = d3.max(yValues) || 1;
  const minValue = d3.min(yValues) || 0;
  const thresholdMax = d3.max(thresholds, (d) => d.to || d.from || 0) || 0;
  const focusedDomain = options.includeZero === false;
  const span = Math.max(40, maxValue - minValue);
  const yDomain = focusedDomain
    ? [Math.max(0, minValue - span * 0.18), maxValue + span * 0.2]
    : [0, Math.max(maxValue, thresholdMax) * 1.08];
  const y = d3.scaleLinear().domain(yDomain).nice().range([innerHeight, 0]);

  const area = g.append("g").attr("class", "threshold-bands");
  thresholds.forEach((band) => {
    const [domainMin, domainMax] = y.domain();
    const rawFrom = band.from == null ? domainMin : band.from;
    const rawTo = band.to == null ? domainMax : band.to;
    const from = Math.max(domainMin, rawFrom);
    const to = Math.min(domainMax, rawTo);
    if (to <= domainMin || from >= domainMax || to <= from) return;
    area
      .append("rect")
      .attr("x", 0)
      .attr("y", y(to))
      .attr("width", innerWidth)
      .attr("height", Math.max(0, y(from) - y(to)))
      .attr("fill", band.color)
      .attr("opacity", 0.13);
  });

  g.append("g")
    .attr("class", "grid-lines")
    .call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(""))
    .call((axis) => axis.select(".domain").remove());

  g.append("g")
    .attr("class", "axis axis-x")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(Math.min(6, rows.length)).tickSizeOuter(0));

  g.append("g")
    .attr("class", "axis axis-y")
    .call(d3.axisLeft(y).ticks(5).tickFormat((value) => `${value}${unit ? ` ${unit}` : ""}`))
    .call((axis) => axis.select(".domain").remove());

  const line = d3
    .line()
    .defined((d) => Number.isFinite(d.value))
    .x((d) => x(d.time))
    .y((d) => y(d.value))
    .curve(d3.curveMonotoneX);

  g.append("path")
    .datum(displayRows)
    .attr("class", "series-line")
    .attr("fill", "none")
    .attr("stroke", options.color || "#276c77")
    .attr("stroke-width", options.strokeWidth || 2.5)
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .attr("d", line);

  const annotationLayer = g.append("g").attr("class", "chart-annotations");
  annotations.forEach((annotation) => {
    if (annotation.type === "threshold" && Number.isFinite(Number(annotation.value))) {
      const yPos = y(Number(annotation.value));
      annotationLayer
        .append("line")
        .attr("class", "annotation-line")
        .attr("x1", 0)
        .attr("x2", innerWidth)
        .attr("y1", yPos)
        .attr("y2", yPos);
      annotationLayer
        .append("text")
        .attr("class", "annotation-label")
        .attr("x", innerWidth - 8)
        .attr("y", yPos - 8)
        .attr("text-anchor", "end")
        .text(annotation.label);
    }

    if (annotation.type === "point" && annotation.time && Number.isFinite(Number(annotation.value))) {
      const time = annotation.time instanceof Date ? annotation.time : new Date(annotation.time);
      if (Number.isNaN(time.getTime())) return;
      const xPos = x(time);
      const yPos = y(Number(annotation.value));
      const anchor = xPos > innerWidth * 0.72 ? "end" : "start";
      const xOffset = anchor === "end" ? -10 : 10;
      annotationLayer
        .append("circle")
        .attr("class", "annotation-dot")
        .attr("cx", xPos)
        .attr("cy", yPos)
        .attr("r", 5);
      annotationLayer
        .append("text")
        .attr("class", "annotation-label")
        .attr("x", xPos + xOffset)
        .attr("y", Math.max(18, yPos - 12 + (annotation.dy || 0)))
        .attr("text-anchor", anchor)
        .text(annotation.label);
    }
  });

  const latest = displayRows[displayRows.length - 1];
  g.append("circle")
    .attr("class", "current-marker")
    .attr("cx", x(latest.time))
    .attr("cy", y(latest.value))
    .attr("r", 5)
    .attr("fill", options.color || "#276c77");

  const focus = g.append("g").attr("class", "chart-focus").style("display", "none");
  focus.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", innerHeight);
  focus.append("circle").attr("r", 4).attr("fill", options.color || "#276c77");

  const tooltip = d3.select(root).append("div").attr("class", "chart-tooltip").attr("hidden", true);
  const bisect = d3.bisector((d) => d.time).center;

  svg
    .append("rect")
    .attr("class", "hit-area")
    .attr("x", margin.left)
    .attr("y", margin.top)
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("fill", "transparent")
    .attr("tabindex", 0)
    .on("mousemove focus", (event) => {
      const pointer = d3.pointer(event, svg.node());
      const date = x.invert(pointer[0] - margin.left);
      const index = Math.max(0, Math.min(rows.length - 1, bisect(rows, date)));
      const point = displayRows[index];
      focus.style("display", null);
      focus.attr("transform", `translate(${x(point.time)},0)`);
      focus.select("circle").attr("cy", y(point.value));
      tooltip
        .attr("hidden", null)
        .style("left", `${Math.min(width - 190, margin.left + x(point.time) + 12)}px`)
        .style("top", `${Math.max(8, margin.top + y(point.value) - 48)}px`)
        .html(
          `<strong>${point.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>` +
            `<span>${metric.label}: ${formatNumber(point.value, metric.decimals)} ${unit}</span>`
        );
    })
    .on("mouseleave blur", () => {
      focus.style("display", "none");
      tooltip.attr("hidden", true);
    });
}

function smoothRows(rows, windowSize) {
  const size = Math.max(1, Math.round(windowSize));
  if (size <= 1 || rows.length < 3) return rows;
  const radius = Math.floor(size / 2);
  return rows.map((row, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(rows.length, index + radius + 1);
    const windowRows = rows.slice(start, end);
    const value = windowRows.reduce((sum, point) => sum + point.value, 0) / windowRows.length;
    return { ...row, value };
  });
}
