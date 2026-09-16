-- NanitesLab schema. Runs once when the TimescaleDB volume is first created.

-- Enable the time-series extension.
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Static building registry (one per campus building).
CREATE TABLE IF NOT EXISTS buildings (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE
);

-- Registered devices, keyed by LoRaWAN DevEUI (16 hex chars, lowercase).
CREATE TABLE IF NOT EXISTS devices (
    id          SERIAL PRIMARY KEY,
    eui         TEXT NOT NULL UNIQUE,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('am103', 'ct305')),
    label       TEXT NOT NULL,
    room        TEXT
);

-- Sensor readings: one row per (time, device, metric). A long/narrow shape
-- keeps a single table for both device types, which measure different things.
CREATE TABLE IF NOT EXISTS readings (
    time      TIMESTAMPTZ NOT NULL,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    metric    TEXT NOT NULL,
    value     DOUBLE PRECISION NOT NULL
);

-- Partition readings by time (the whole point of TimescaleDB).
SELECT create_hypertable('readings', 'time', if_not_exists => TRUE);

-- Fast lookups for "latest per device" and "history per building".
CREATE INDEX IF NOT EXISTS idx_readings_device_time
    ON readings (device_id, time DESC);

-- Seed the three buildings. Devices are registered as they are installed
-- (their DevEUIs are read from the device labels / gateway join log).
INSERT INTO buildings (name, slug) VALUES
    ('Kjølv Egelands hus', 'kjolv-egelands-hus'),
    ('Library',            'library'),
    ('Arne Rettedals hus', 'arne-rettedals-hus')
ON CONFLICT (name) DO NOTHING;
