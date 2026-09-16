-- Migration 0002: downsampling + retention.
-- Raw readings are kept for 90 days, then rolled into hourly averages that
-- are kept indefinitely. This keeps the dashboard fast forever while
-- preserving long-term trends (used by Grafana).

-- Drop raw readings older than 90 days.
SELECT add_retention_policy('readings', INTERVAL '90 days', if_not_exists => TRUE);

-- Hourly rollup as a continuous aggregate (avg/min/max per metric, per device).
CREATE MATERIALIZED VIEW IF NOT EXISTS readings_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    device_id,
    metric,
    avg(value) AS avg,
    min(value) AS min,
    max(value) AS max
FROM readings
GROUP BY bucket, device_id, metric
WITH NO DATA;

-- Keep the hourly aggregate fresh on a schedule.
-- (start_offset/end_offset stay well inside the 90-day raw retention window.)
SELECT add_continuous_aggregate_policy('readings_hourly',
    start_offset      => INTERVAL '3 hours',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists     => TRUE);
