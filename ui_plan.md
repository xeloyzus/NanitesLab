# NanitesLab --- Student Frontend & Data Intelligence Implementation Plan

> **Purpose:** Implementation specification for an AI coding agent
> redesigning the NanitesLab public frontend.
>
> **Primary goal:** Turn NanitesLab from a conventional IoT sensor
> dashboard into an interactive **campus sustainability living lab** for
> students: show what is happening, why it matters, how it is changing,
> what can reasonably be done about it, and how confident the system is
> in those conclusions.
>
> **Important constraint:** Do **not** reproduce or preserve the former
> UI design described in existing markdown documentation. Treat the
> current backend, data model, sensor infrastructure, deployment
> architecture, and API behavior as constraints; treat the frontend as a
> fresh redesign.

------------------------------------------------------------------------

## 1. Project context

NanitesLab is a UiS living-lab sensor network for indoor climate and
electricity monitoring. The current repository describes:

-   Milesight AM103 indoor-climate sensors.
-   CT305 electricity/current monitoring.
-   LoRaWAN devices communicating through a UG65 gateway.
-   MQTT/Mosquitto ingestion.
-   TimescaleDB storage.
-   FastAPI backend.
-   Jinja2/static JavaScript frontend.
-   Raspberry Pi / Chromium kiosk displays.
-   Public mobile/dashboard routes.
-   Approximately 13 devices reporting around every 15 minutes.
-   Raw readings retained for a limited period and hourly rollups
    retained long-term.
-   Long-term operation intended to support year-over-year analysis
    through 2030.
-   Existing building endpoints for building discovery, current
    readings, and historical readings.

Preserve the existing self-hosted architecture unless a change is
justified by a concrete feature in this plan.

------------------------------------------------------------------------

# 2. Product vision

The redesigned product should answer four questions in order:

1.  **What is happening on campus right now?**
2.  **How has it changed?**
3.  **What patterns can we discover in the data?**
4.  **What actions could plausibly improve the situation?**

The interface should translate sensor measurements into understandable
context without hiding the raw data.

Bad:

> CO₂: 1,247 ppm

Better:

> **CO₂ is elevated and has been rising for 45 minutes.**\
> 1,247 ppm · +214 ppm in 45 min\
> Ventilation may be insufficient for the current occupancy/activity
> level.

The UI must always make the underlying measurement available.

------------------------------------------------------------------------

# 3. Design principles

## 3.1 Student-first

Assume many visitors do not know what ppm, kW, kWh, percentiles,
baselines, or downsampling mean.

Use progressive disclosure:

-   plain-language status first;
-   measurement second;
-   trend/context third;
-   technical explanation on demand.

## 3.2 Evidence before advice

Recommendations must be derived from observed data and transparent
rules.

Never imply that sensor data proves a cause when it only shows an
association.

Use language such as:

-   "may indicate"
-   "is consistent with"
-   "consider checking"
-   "the data suggests"
-   "possible action"
-   "requires facilities verification"

Avoid:

-   "this proves"
-   "the building is unhealthy"
-   "students caused"
-   "the ventilation system is broken"

unless the system actually has the evidence necessary for such a
conclusion.

## 3.3 Trends over isolated values

Prioritize:

-   direction;
-   duration;
-   recurrence;
-   comparison with normal conditions;
-   peaks;
-   time above documented thresholds;
-   relationships between metrics.

Avoid gauge-heavy design.

## 3.4 Trust

Every metric must expose:

-   value;
-   unit;
-   timestamp;
-   source sensor;
-   location;
-   freshness;
-   aggregation level where relevant.

## 3.5 Educational value

The site should help students understand:

-   indoor climate;
-   ventilation;
-   energy demand;
-   baseload;
-   time-series analysis;
-   correlation versus causation;
-   sensor limitations;
-   sustainability tradeoffs.

------------------------------------------------------------------------

# 4. Primary navigation

Use four main public sections:

1.  **Overview**
2.  **Buildings**
3.  **Explore**
4.  **About the Lab**

Kiosk mode is a separate presentation mode rather than another
navigation item.

------------------------------------------------------------------------

# 5. Overview --- "Campus Pulse"

## Objective

Give a visitor an understandable campus snapshot in under five seconds.

## Components

### Campus status header

Display:

-   "NanitesLab" / "UiS Campus Pulse"
-   current data status;
-   latest reading time;
-   data freshness indicator;
-   link to methodology.

Example:

> **How is campus doing right now?**\
> Latest sensor data: 3 min ago

### Air summary

Show:

-   current campus/building average or clearly defined aggregate;
-   status description;
-   trend over last hour;
-   small sparkline;
-   number of active reporting sensors.

### Energy summary

Show:

-   current demand in kW;
-   energy consumed today in kWh if derivable;
-   change relative to an appropriate comparison;
-   current versus expected/same-hour baseline.

### Building cards

Each card contains:

-   building name;
-   latest CO₂;
-   temperature;
-   electricity where available;
-   trend arrow;
-   freshness;
-   small sparkline.

Clicking enters the building view.

### "What's happening?" insight feed

Automatically generated observations, for example:

-   "Library CO₂ reached today's highest measured value at 13:42."
-   "Current electricity demand is below the typical level for this
    weekday/hour."
-   "Reading Room 2 has shown a sustained CO₂ rise for 45 minutes."
-   "Three sensors have not reported recently."

Do not generate insights from tiny/noisy changes.

------------------------------------------------------------------------

# 6. Building view

Navigation model:

**Campus → Building → Floor/room → Sensor**

## Building header

Show:

-   building name;
-   current status summary;
-   active sensor count;
-   delayed/stale sensor count;
-   latest update;
-   time-range selector.

## Room/sensor cards

For each sensor:

-   room/floor;
-   CO₂;
-   temperature;
-   timestamp;
-   freshness;
-   trend;
-   click-through.

Never silently average sensors with different freshness states.

## Building comparison

Allow comparison over:

-   now;
-   today;
-   7 days;
-   30 days;
-   longer periods when hourly rollups are available.

Metrics:

-   CO₂;
-   temperature;
-   electricity.

Use descriptive labels such as:

> Lowest measured average CO₂ today

Avoid unsupported labels such as:

> Healthiest building

------------------------------------------------------------------------

# 7. Sensor detail view

Each sensor page should contain:

-   sensor label;
-   physical location;
-   sensor type;
-   last reading;
-   last contact;
-   freshness;
-   current metrics;
-   24 h / 7 d / 30 d / custom history;
-   statistics;
-   explanation of the metric;
-   related insights;
-   possible actions where applicable.

Show missing-data periods as gaps, not interpolated continuous lines
unless interpolation is explicitly enabled and visually distinguished.

------------------------------------------------------------------------

# 8. D3 visualization system

Create reusable D3 modules instead of page-specific chart code.

Suggested structure:

``` text
app/static/js/
  api.js
  dashboard.js

  charts/
    timeSeries.js
    multiMetricTimeline.js
    comparisonBars.js
    heatmap.js
    scatterPlot.js
    distribution.js
    energyProfile.js

  components/
    metricCard.js
    buildingSelector.js
    sensorSelector.js
    timeRangeSelector.js
    tooltip.js
    crosshair.js
    insightCard.js
    recommendationCard.js
    freshnessBadge.js

  intelligence/
    thresholds.js
    insights.js
    recommendations.js

  utils/
    format.js
    time.js
    statistics.js
    accessibility.js
```

D3 components should accept roughly:

``` js
renderChart({
  container,
  data,
  metric,
  options
})
```

Do not make charts responsible for fetching data.

------------------------------------------------------------------------

# 9. CO₂ timeline

This is a primary visualization.

Features:

-   D3 line chart;
-   documented contextual/threshold bands;
-   current-value marker;
-   hover crosshair;
-   tooltip;
-   min/max markers;
-   optional comparison line;
-   missing-data gaps;
-   zoom/brush for longer periods;
-   responsive resize;
-   accessible summary text.

Tooltip example:

``` text
13:42
CO₂          1,183 ppm
Temperature  22.3 °C
Change       +214 ppm / 30 min
```

Threshold/background bands must come from configurable methodology, not
magic values embedded in chart code.

------------------------------------------------------------------------

# 10. "24 Hours at UiS" synchronized timeline

Create a signature visualization with aligned timelines for:

-   electricity demand;
-   CO₂;
-   temperature.

All charts share:

-   x-axis;
-   crosshair;
-   selected time;
-   tooltip state.

Purpose:

Allow students to visually investigate whether changes happen at similar
times.

Never state that simultaneous movement establishes causation.

Add optional annotations for:

-   daily peak;
-   sustained CO₂ rise;
-   energy ramp-up;
-   energy peak;
-   return toward baseline.

------------------------------------------------------------------------

# 11. Campus Rhythm heatmap

D3 heatmap:

-   rows = weekday;
-   columns = hour;
-   color/intensity = selected metric.

Metric selector:

-   CO₂;
-   temperature;
-   energy.

Filters:

-   building;
-   room/sensor where applicable;
-   date range.

Potential generated observation:

> CO₂ has historically been higher Tuesday--Thursday around midday
> during the selected period.

Only generate this when sample coverage is sufficient.

------------------------------------------------------------------------

# 12. Building comparison chart

Use horizontal D3 bars for easy comparison.

Controls:

-   metric;
-   date/time period;
-   statistic.

Statistics may include:

-   current;
-   mean;
-   median;
-   maximum;
-   p95;
-   time above threshold;
-   energy total;
-   peak demand.

Always display units and sample coverage.

------------------------------------------------------------------------

# 13. Explore the Data

This should behave like a lightweight student data laboratory.

Controls:

``` text
Building
Sensor
Metric
Time range
Aggregation
Comparison
```

Time options:

-   24 hours;
-   7 days;
-   30 days;
-   custom;
-   year-over-year when sufficient data exists.

Statistics panel:

-   current;
-   min;
-   max;
-   mean;
-   median;
-   p95;
-   sample count;
-   coverage percentage.

Actions:

-   Download CSV;
-   copy/share chart state;
-   reset;
-   show methodology.

------------------------------------------------------------------------

# 14. Relationship explorer

D3 scatter plot for pairs such as:

-   CO₂ vs temperature;
-   CO₂ vs electricity;
-   temperature vs electricity.

Features:

-   each point represents a documented interval;
-   hover timestamp;
-   optional trend line;
-   correlation coefficient if statistically appropriate;
-   sample count;
-   filters;
-   warning about causality.

Always display:

> **Relationship does not imply causation.** Occupancy, weather,
> schedules, ventilation settings and other variables may affect both
> measurements.

Do not generate causal recommendations solely from correlation.

------------------------------------------------------------------------

# 15. Electricity experience

Electricity requires its own information design.

Display:

-   current demand (kW);
-   energy today (kWh);
-   peak demand;
-   peak timestamp;
-   estimated/derived baseload;
-   daytime/activity load;
-   comparison with previous comparable period;
-   same-weekday/hour historical baseline where possible.

## Energy profile chart

D3 line/area visualization for demand across a day.

## Baseload visualization

Separate:

-   estimated baseline consumption;
-   activity-associated consumption.

Label baseload as an **estimate** and document the calculation.

Useful insight:

> Overnight demand has remained above the recent overnight baseline for
> several hours.

This can trigger a recommendation to investigate equipment, lighting,
HVAC or other scheduled loads, but should not claim which device caused
it without submetering.

------------------------------------------------------------------------

# 16. Data freshness

Every reading should be classified.

Initial configurable example:

``` text
current   < 20 minutes
delayed   20–45 minutes
stale     > 45 minutes
```

These values should be configuration, not hardcoded presentation logic.

A stale reading must never appear visually identical to a fresh reading.

Example:

> CO₂: 742 ppm\
> ⚠ Last reading 1 h 18 min ago

Campus/building aggregates must disclose if they exclude stale sensors.

------------------------------------------------------------------------

# 17. Derived analytics

Prefer backend-calculated statistics so kiosk, mobile and desktop use
identical definitions.

## CO₂

Calculate where data permits:

-   current;
-   30/60-minute change;
-   daily mean;
-   median;
-   max;
-   p95;
-   peak timestamp;
-   time above configured threshold(s);
-   longest sustained elevated interval;
-   daily profile;
-   weekday/hour profile;
-   historical same-hour baseline;
-   coverage.

## Temperature

Calculate:

-   current;
-   min;
-   max;
-   mean;
-   median;
-   daily range;
-   deviation from documented reference range;
-   sustained excursions;
-   historical same-hour baseline.

## Electricity

Calculate:

-   current kW;
-   accumulated kWh;
-   peak kW;
-   peak timestamp;
-   estimated overnight baseload;
-   daytime average;
-   previous-day comparison;
-   previous-week comparable-day comparison;
-   same-hour baseline;
-   cumulative consumption;
-   unusual sustained load;
-   coverage.

------------------------------------------------------------------------

# 18. New feature: Action & Improvement Engine

This is a major feature of the redesign.

The system should not stop at:

> "CO₂ is elevated."

It should progress through:

**Observation → interpretation → possible action → verification**

Example:

> **CO₂ has remained elevated in Reading Room 2 for 55 minutes.**\
> The pattern may indicate that ventilation is not keeping pace with
> room activity.
>
> **Possible action:** If appropriate for the room and building
> operation, increase ventilation or check whether the room is
> overcrowded.
>
> **Verify:** Watch whether CO₂ begins falling during the next
> measurement intervals.

This makes the platform educational and actionable while avoiding
unsupported certainty.

------------------------------------------------------------------------

# 19. Recommendation categories

Recommendations should have an audience.

## Student actions

Low-risk actions students can understand or take where permitted:

-   move to a less crowded room;
-   take a break / use another study area;
-   open a window **only where building policy and conditions permit**;
-   avoid obstructing vents;
-   report persistent indoor-climate issues.

## Facilities actions

Clearly labeled:

**For facilities / building operators**

Examples:

-   inspect ventilation schedule;
-   verify ventilation is operating during occupied hours;
-   inspect persistent elevated CO₂ patterns;
-   investigate unexplained overnight electricity demand;
-   review HVAC scheduling;
-   inspect lighting/equipment schedules;
-   verify a sensor showing anomalous/stale behavior.

## Research/student-project actions

Examples:

-   compare weekdays;
-   test before/after intervention periods;
-   investigate occupancy proxies;
-   compare seasonal patterns;
-   explore relationships between electricity and indoor climate.

------------------------------------------------------------------------

# 20. Recommendation rules

Build the first version as a transparent deterministic rules engine, not
an opaque AI model.

Pseudo-structure:

``` python
RecommendationRule(
    id="co2_sustained_elevation",
    metric="co2",
    conditions=[...],
    severity="attention",
    audience=["student", "facilities"],
    explanation="...",
    actions=[...],
    verification="..."
)
```

Each generated recommendation must include:

``` json
{
  "id": "co2_sustained_elevation",
  "title": "CO₂ has remained elevated",
  "evidence": {
    "current": 1247,
    "duration_minutes": 55,
    "trend": 184,
    "samples": 5
  },
  "interpretation": "The pattern may indicate...",
  "actions": [],
  "audience": ["student", "facilities"],
  "confidence": "medium",
  "verification": "...",
  "methodology_id": "co2-v1"
}
```

------------------------------------------------------------------------

# 21. CO₂ recommendation examples

Do not hardcode final scientific/operational thresholds until UiS
methodology has selected/documented them. Use configuration.

## Sustained elevation

Trigger when:

-   readings exceed configured reference level;
-   condition persists across enough measurements;
-   coverage is adequate.

Possible response:

> CO₂ has remained elevated for the selected period. This can be
> consistent with occupancy exceeding effective ventilation.

Possible actions:

-   students: consider another room if available;
-   permitted local action: increase ventilation where appropriate;
-   facilities: check ventilation operation/schedule if the pattern is
    recurrent.

Verification:

> Check whether CO₂ trends downward over the next 30--60 minutes.

## Rapid rise

Trigger on significant rate-of-change.

Response:

> CO₂ is rising faster than its recent baseline.

Action:

> Check occupancy/activity and whether ventilation is
> available/operating.

## Recurrent pattern

Trigger only after multiple comparable days.

Response:

> Elevated CO₂ repeatedly appears around the same weekday/time.

Facilities action:

> Review ventilation scheduling for that recurring occupied period.

This is much stronger than reacting to one isolated spike.

------------------------------------------------------------------------

# 22. Temperature recommendation examples

Avoid declaring a room unsafe from temperature alone.

## Sustained deviation

Response:

> Temperature has remained outside the project's documented reference
> range for X minutes.

Possible actions:

-   check room controls if available;
-   check whether windows/doors or solar gain explain the condition;
-   facilities can review HVAC scheduling if recurrent.

## Recurring time-of-day pattern

Example:

> The room repeatedly warms during the afternoon.

Investigation suggestions:

-   solar gain;
-   occupancy;
-   ventilation/HVAC schedule;
-   equipment loads.

Present these as hypotheses to investigate, not conclusions.

------------------------------------------------------------------------

# 23. Electricity recommendation examples

## Elevated overnight baseload

Observation:

> Overnight electricity demand has remained above the recent baseline.

Possible facilities action:

-   check equipment left running;
-   review lighting schedules;
-   review HVAC schedules;
-   compare with known always-on loads.

Do not claim which system caused the load without submetering.

## Unusual peak

Observation:

> Today's demand peak was substantially above the recent comparable-day
> pattern.

Action:

> Compare the peak time with building schedules or known high-load
> activities.

## Persistent avoidable-looking load

If the pattern repeats outside expected occupied periods:

> Electricity demand remains consistently elevated during low-activity
> hours.

Possible action:

> Investigate scheduling opportunities before assuming equipment
> failure.

------------------------------------------------------------------------

# 24. Recommendation confidence

Each recommendation should expose confidence based on evidence quality.

Example:

### High confidence

-   sufficient samples;
-   current data;
-   repeated pattern;
-   clear rule;
-   strong baseline coverage.

### Medium confidence

-   enough recent samples;
-   plausible deviation;
-   limited historical repetition.

### Low confidence

-   sparse data;
-   stale sensor;
-   short-lived anomaly;
-   weak baseline.

Low-confidence recommendations should be phrased as investigation
prompts rather than actions.

------------------------------------------------------------------------

# 25. Recommendation priority

Keep separate concepts:

-   **severity of measured condition**
-   **confidence in interpretation**
-   **urgency of suggested action**

Do not collapse all three into one red/yellow/green score.

A measurement can be notable while the causal explanation remains
uncertain.

------------------------------------------------------------------------

# 26. Before/after intervention analysis

Add a feature that allows researchers/facilities to mark an
intervention:

``` text
Intervention:
Ventilation schedule adjusted

Date:
2026-10-12

Building:
Library

Rooms:
Reading Room 1 / 2
```

Then compare:

-   same weekday/time before;
-   same weekday/time after;
-   CO₂ distribution;
-   time above reference level;
-   electricity impact;
-   sample coverage.

This turns recommendations into testable experiments.

UI language:

> After the selected intervention, median midday CO₂ changed by X while
> electricity changed by Y over comparable periods.

Do not claim causation unless the study design supports it.

------------------------------------------------------------------------

# 27. Recommendation feedback loop

Allow users with appropriate permissions to mark:

-   reviewed;
-   action taken;
-   not applicable;
-   sensor issue;
-   investigate later.

Optional note:

> "Ventilation schedule changed from 08:00 to 07:30."

This creates an audit trail and allows later before/after analysis.

------------------------------------------------------------------------

# 28. Insight engine

Separate **insights** from **recommendations**.

Insight:

> CO₂ reached today's highest measured level at 13:42.

Recommendation:

> Because elevated levels persisted for 55 minutes, consider checking
> ventilation/occupancy conditions.

Initial insight rules:

``` text
daily_peak
daily_low
rapid_rise
rapid_fall
sustained_threshold
unusual_vs_baseline
recurrent_hour_pattern
energy_peak
elevated_baseload
sensor_stale
missing_data
cross_metric_coincidence
```

Only surface meaningful changes.

------------------------------------------------------------------------

# 29. Baselines

Recommendations become much better when comparing against context rather
than yesterday alone.

Build baselines such as:

-   same building;
-   same sensor;
-   same weekday;
-   same hour;
-   recent N comparable weeks.

Return:

``` json
{
  "current": 1180,
  "baseline_mean": 760,
  "baseline_median": 735,
  "baseline_p95": 1040,
  "difference": 420,
  "sample_count": 42,
  "coverage": 0.91
}
```

This enables:

> CO₂ is higher than the recent typical range for this room at this
> weekday/time.

------------------------------------------------------------------------

# 30. Data quality layer

Add explicit data-quality metadata.

Track:

-   expected samples;
-   received samples;
-   coverage percentage;
-   last reading;
-   longest gap;
-   sensor freshness;
-   aggregation type;
-   suspicious values;
-   sensor status where available.

Recommendations should be suppressed or downgraded when quality is
insufficient.

------------------------------------------------------------------------

# 31. Suggested API evolution

Preserve existing endpoints for compatibility.

Add endpoints along these lines:

``` text
GET /api/campus/summary
GET /api/buildings
GET /api/buildings/{id}/summary
GET /api/buildings/{id}/current
GET /api/buildings/{id}/history
GET /api/buildings/{id}/insights
GET /api/buildings/{id}/recommendations

GET /api/sensors
GET /api/sensors/{id}
GET /api/sensors/{id}/history
GET /api/sensors/{id}/statistics
GET /api/sensors/{id}/insights
GET /api/sensors/{id}/recommendations

GET /api/compare
GET /api/heatmap
GET /api/relationships
GET /api/energy/summary
GET /api/baselines

GET /api/methodology
GET /api/data-quality
```

If recommendations are persisted:

``` text
POST /api/interventions
GET  /api/interventions
POST /api/recommendations/{id}/feedback
```

------------------------------------------------------------------------

# 32. History response shape

Return chart-ready rows with metadata.

Example:

``` json
{
  "metric": "co2",
  "unit": "ppm",
  "sensor_id": 12,
  "range": "24h",
  "aggregation": "raw",
  "coverage": 0.96,
  "data": [
    {
      "timestamp": "2026-09-17T08:00:00+02:00",
      "value": 612
    }
  ]
}
```

For aggregated data:

``` json
{
  "timestamp": "...",
  "mean": 721,
  "min": 642,
  "max": 811,
  "samples": 4
}
```

------------------------------------------------------------------------

# 33. Summary endpoint shape

Example:

``` json
{
  "building_id": 2,
  "generated_at": "...",
  "data_quality": {
    "active_sensors": 6,
    "stale_sensors": 1,
    "coverage_24h": 0.94
  },
  "co2": {
    "current": 842,
    "mean_24h": 721,
    "median_24h": 698,
    "max_24h": 1382,
    "p95_24h": 1194,
    "peak_time": "...",
    "change_1h": 84
  },
  "energy": {
    "current_kw": 18.4,
    "today_kwh": 132.0,
    "peak_kw": 27.3,
    "peak_time": "...",
    "baseline_kw": 6.1
  }
}
```

------------------------------------------------------------------------

# 34. Kiosk mode

The kiosk is passive storytelling, not a desktop dashboard stretched to
a large screen.

Auto-rotate approximately every 10--15 seconds between:

1.  Campus now
2.  Air quality today
3.  Energy today
4.  24 Hours at UiS
5.  Building comparison
6.  Interesting insight
7.  Recommended/improvement action
8.  QR code to Explore

Requirements:

-   large typography;
-   viewing-distance readability;
-   no hover-dependent information;
-   automatic recovery;
-   obvious data timestamp;
-   stale-data state;
-   reduced controls;
-   optional subtle transitions;
-   no distracting animation.

Recommendation cards should use cautious language and identify whether
the action is for students or facilities.

------------------------------------------------------------------------

# 35. Mobile experience

Mobile should prioritize:

1.  campus/building selector;
2.  current metric;
3.  status/context;
4.  sparkline;
5.  time range;
6.  recommendations;
7.  deeper exploration.

Do not render desktop charts at tiny widths.

Use dedicated mobile chart layouts.

------------------------------------------------------------------------

# 36. Visual language

Aim for:

> university research dashboard + science museum exhibit

Avoid:

> industrial SCADA + crypto dashboard + neon IoT control panel

Suggested direction:

-   light/off-white neutral background;
-   dark charcoal typography;
-   restrained semantic accents;
-   generous whitespace;
-   large numeric typography;
-   thin chart strokes;
-   subtle grid lines;
-   cards only where they establish hierarchy;
-   color used for meaning.

Do not rely on color alone.

------------------------------------------------------------------------

# 37. Accessibility

Target WCAG 2.2 AA where practical.

Requirements:

-   keyboard navigation;
-   visible focus;
-   semantic HTML;
-   sufficient contrast;
-   chart descriptions;
-   tooltips accessible without mouse-only interaction;
-   reduced-motion support;
-   no color-only state;
-   descriptive labels;
-   screen-reader summaries of important chart findings.

Every D3 visualization should have a textual equivalent such as:

> During the selected 24-hour period, measured CO₂ ranged from X to Y
> ppm and peaked at TIME.

------------------------------------------------------------------------

# 38. Metric education

Every metric should have an explainer.

Example:

### What is CO₂?

Explain:

-   what is measured;
-   unit;
-   why it can be useful as an indoor ventilation/occupancy-related
    indicator;
-   what it does **not** prove;
-   how project reference bands were selected.

Do the same for:

-   temperature;
-   kW;
-   kWh;
-   baseload;
-   mean;
-   median;
-   p95;
-   coverage.

------------------------------------------------------------------------

# 39. About the Lab

Explain the data pipeline visually:

``` text
Sensor
  ↓ LoRaWAN
UG65 gateway
  ↓ MQTT
Mosquitto
  ↓
Ingest / decode
  ↓
TimescaleDB
  ↓
FastAPI
  ↓
NanitesLab dashboard
```

Include:

-   sensor types;
-   approximate reporting interval;
-   retention/aggregation;
-   methodology;
-   data limitations;
-   privacy statement;
-   project goals;
-   source-code link.

------------------------------------------------------------------------

# 40. Privacy

Do not infer or display individual occupancy.

If occupancy is estimated later, clearly label it as an estimate and
document its method.

Avoid wording that could imply surveillance of identifiable students.

Prefer:

> Room activity appears higher than usual.

Avoid:

> 24 students are currently here.

unless a separate, appropriately governed occupancy sensor actually
provides that information.

------------------------------------------------------------------------

# 41. Performance

D3 must remain smooth on kiosk hardware and phones.

Requirements:

-   server-side downsampling for large periods;
-   avoid sending raw multi-year series;
-   cache summary/baseline queries;
-   resize charts with `ResizeObserver`;
-   debounce expensive redraws;
-   do not recreate the entire DOM unnecessarily;
-   use SVG for normal chart sizes;
-   consider Canvas only if point counts make SVG impractical.

------------------------------------------------------------------------

# 42. Testing

## Backend

Test:

-   statistics;
-   baseline calculations;
-   threshold duration;
-   stale classification;
-   coverage;
-   insight rules;
-   recommendation rules;
-   confidence;
-   time zones;
-   daylight-saving transitions;
-   missing readings;
-   aggregation.

## Frontend

Test:

-   responsive rendering;
-   empty data;
-   stale data;
-   one data point;
-   long labels;
-   missing metrics;
-   partial sensor failure;
-   tooltip/crosshair;
-   keyboard interaction;
-   kiosk resolution;
-   mobile width;
-   reduced motion.

## Recommendation tests

Rules should be deterministic and unit-tested.

Given a fixed time series, the same recommendation should always be
produced.

------------------------------------------------------------------------

# 43. Time handling

Store/query timestamps consistently and display in the campus local
timezone.

Pay special attention to:

-   DST transitions;
-   daily comparisons;
-   same-hour baselines;
-   kiosk timestamps;
-   CSV exports.

Do not compare 24-hour windows naïvely across DST boundaries.

------------------------------------------------------------------------

# 44. Empty/error states

Examples:

### No recent data

> No recent readings are available for this sensor.

### Stale

> Latest reading is 1 h 18 min old. Current conditions may differ.

### Insufficient history

> More historical data is needed before a reliable same-hour baseline
> can be calculated.

### Recommendation suppressed

> No action suggestion is shown because recent data coverage is too low.

Trust is more important than always filling the screen.

------------------------------------------------------------------------

# 45. Suggested implementation phases

## Phase 1 --- Foundations

Implement:

-   design tokens;
-   base layout;
-   navigation;
-   API client;
-   formatting utilities;
-   time handling;
-   freshness;
-   reusable metric card;
-   reusable D3 time series;
-   tooltip/crosshair;
-   loading/error/empty states.

Do not begin with every visualization.

## Phase 2 --- Campus Pulse

Implement:

-   campus summary endpoint;
-   overview page;
-   air summary;
-   energy summary;
-   building cards;
-   basic insight feed.

## Phase 3 --- Building & sensor drill-down

Implement:

-   building page;
-   sensor cards;
-   sensor page;
-   history;
-   statistics;
-   freshness/data quality.

## Phase 4 --- D3 exploration

Implement:

-   synchronized 24-hour timeline;
-   comparison bars;
-   heatmap;
-   relationship scatter plot;
-   CSV export.

## Phase 5 --- Analytics

Implement backend:

-   statistics service;
-   baselines;
-   coverage;
-   sustained-condition detection;
-   recurring-pattern detection;
-   energy baseload estimation.

## Phase 6 --- Action & Improvement Engine

Implement:

-   recommendation rule model;
-   CO₂ rules;
-   temperature rules;
-   energy rules;
-   confidence;
-   recommendation cards;
-   verification prompts;
-   audience labels.

## Phase 7 --- Intervention analysis

Implement:

-   intervention records;
-   before/after comparison;
-   recommendation feedback;
-   facilities workflow.

## Phase 8 --- Kiosk

Implement dedicated kiosk presentation using existing data/components
but a separate composition.

## Phase 9 --- Accessibility/performance hardening

Audit:

-   WCAG;
-   keyboard behavior;
-   chart summaries;
-   load performance;
-   kiosk stability;
-   caching;
-   query cost.

------------------------------------------------------------------------

# 46. Suggested backend service architecture

Keep HTTP routers thin.

Example:

``` text
app/
  routers/
    campus.py
    buildings.py
    sensors.py
    analytics.py
    recommendations.py
    interventions.py

  services/
    readings.py
    statistics.py
    baselines.py
    data_quality.py
    insights.py
    recommendations.py
    interventions.py

  schemas/
    readings.py
    analytics.py
    insights.py
    recommendations.py
    interventions.py
```

Business logic should not live inside route handlers.

------------------------------------------------------------------------

# 47. Recommendation methodology configuration

Create versioned configuration, for example:

``` text
app/config/methodology/
  co2-v1.yaml
  temperature-v1.yaml
  energy-v1.yaml
```

Include:

-   thresholds/reference bands;
-   minimum duration;
-   minimum sample count;
-   freshness requirements;
-   confidence rules;
-   baseline windows;
-   recommendation copy IDs.

This makes future methodology changes auditable.

Store the methodology version with persisted
recommendations/interventions where relevant.

------------------------------------------------------------------------

# 48. Avoid an LLM dependency for core recommendations

The public dashboard should not require an external generative AI
service to decide whether a recommendation exists.

Use deterministic analytics/rules for:

-   triggering;
-   evidence;
-   severity;
-   confidence;
-   allowed actions.

If an LLM is ever added later, restrict it to optional natural-language
explanation of already-determined facts, and never allow it to invent
measurements or actions outside the approved recommendation library.

------------------------------------------------------------------------

# 49. Acceptance criteria

The redesign is successful when a first-time student can answer, without
prior sensor knowledge:

-   What is happening now?
-   Is the value rising or falling?
-   Where is it happening?
-   Is it unusual for this place/time?
-   How reliable/fresh is the data?
-   What might explain the pattern?
-   What reasonable action could be considered?
-   How would we know whether that action helped?
-   Can I inspect/download the underlying data?

A facilities user should additionally be able to answer:

-   Which patterns recur?
-   Which rooms/buildings deserve investigation?
-   Are there unexplained energy loads?
-   Did an intervention appear to improve the measured outcome?
-   What was the energy tradeoff?

------------------------------------------------------------------------

# 50. Definition of done for every new visualization

A visualization is not complete until it has:

-   meaningful title;
-   unit;
-   time range;
-   data source context;
-   freshness/coverage;
-   loading state;
-   empty state;
-   error state;
-   mobile layout;
-   keyboard-accessible interaction where interactive;
-   textual summary;
-   missing-data handling;
-   documented aggregation;
-   test coverage for transformation logic.

------------------------------------------------------------------------

# 51. Definition of done for every recommendation

A recommendation is not complete until it has:

-   triggering rule;
-   evidence;
-   minimum data quality;
-   confidence;
-   audience;
-   cautious interpretation;
-   approved action(s);
-   verification method;
-   methodology version;
-   unit tests;
-   suppression behavior for insufficient/stale data.

------------------------------------------------------------------------

# 52. AI coding-agent instructions

When implementing this plan:

1.  Inspect the repository before modifying code.
2.  Preserve the current sensor ingestion pipeline and deployment
    behavior unless a feature explicitly requires a backend change.
3.  Ignore previous UI styling/layout proposals in markdown files.
4.  Reuse the existing FastAPI/Jinja/static-JS architecture unless
    migration has a concrete, documented benefit.
5.  Prefer small reusable D3 modules over a frontend framework
    migration.
6.  Keep chart rendering separate from data fetching.
7.  Put statistics/recommendation logic in backend services where
    possible.
8.  Never fabricate missing measurements.
9.  Represent missing samples as missing.
10. Always expose timestamps and freshness.
11. Keep thresholds/methodology configurable and versioned.
12. Treat recommendations as evidence-backed suggestions, not automated
    diagnoses.
13. Do not infer causation from correlation.
14. Do not infer individual occupancy.
15. Add tests with each analytics rule.
16. Maintain backward compatibility with existing API routes unless
    explicitly versioning/removing them.
17. Implement in phases; do not attempt a monolithic rewrite.
18. After each phase, run the existing test suite plus new tests and fix
    regressions before proceeding.
19. Keep kiosk performance in mind throughout implementation.
20. Update project documentation to describe the implemented behavior
    and methodology, not obsolete UI mockups.

------------------------------------------------------------------------

# 53. Recommended first implementation ticket

Start with a vertical slice rather than all features.

Build:

**Library / one building → current metrics → CO₂ D3 timeline → freshness
→ statistics → one insight → one recommendation**

Required pieces:

-   summary/statistics service;
-   history endpoint improvements if needed;
-   D3 time-series component;
-   metric card;
-   freshness badge;
-   deterministic sustained-CO₂ insight;
-   deterministic recommendation card;
-   unit tests.

Once this slice is robust, generalize it to every building/sensor and
then implement heatmaps, relationships, energy intelligence and
interventions.

------------------------------------------------------------------------

# 54. Final product concept

NanitesLab should evolve through four levels:

``` text
LEVEL 1 — MEASURE
“What is the value?”

          ↓

LEVEL 2 — EXPLAIN
“What does the value/trend mean?”

          ↓

LEVEL 3 — DISCOVER
“What patterns exist across time, rooms and metrics?”

          ↓

LEVEL 4 — IMPROVE
“What evidence-backed action could we try, and did it help?”
```

That final level is the key addition.

The dashboard should not merely say:

> "CO₂ was high."

It should be capable of saying:

> "CO₂ has been elevated in this room for 55 minutes and this pattern
> has appeared repeatedly around the same time on comparable weekdays.
> The data is consistent with ventilation not keeping pace with room
> activity. Consider checking ventilation scheduling or room usage.
> After an intervention, compare the next comparable periods to
> determine whether CO₂ duration/peaks improve and whether electricity
> demand changes."

That turns NanitesLab from a sensor display into a genuine
**student-facing sustainability laboratory and evidence-to-action
platform**.
