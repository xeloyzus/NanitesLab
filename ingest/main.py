"""MQTT -> TimescaleDB ingest service.

Subscribes to the gateway MQTT broker, decodes Milesight uplinks, and writes
one row per metric to the ``readings`` table.

Expected message format (ChirpStack-style JSON, as published by the UG65's
embedded network server)::

    {"devEUI": "...", "data": "<base64 frame payload>", "time": "..."}

Both ChirpStack v3 (``devEUI`` at top level) and v4 (``deviceInfo.devEui``)
are supported; the base64 payload is always in ``data``.
"""

import base64
import json
import logging
import os
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
import psycopg

from decoders import decode

log = logging.getLogger("ingest")

DATABASE_URL = os.environ["DATABASE_URL"]
MQTT_HOST = os.environ.get("MQTT_HOST", "mosquitto")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_TOPIC = os.environ.get("MQTT_TOPIC", "#")


class Database:
    """A single persistent connection that reconnects transparently."""

    def __init__(self) -> None:
        self._conn = psycopg.connect(DATABASE_URL, autocommit=True)

    @property
    def conn(self) -> psycopg.Connection:
        if self._conn.closed:
            self._conn = psycopg.connect(DATABASE_URL, autocommit=True)
        return self._conn

    def reset(self) -> None:
        """Drop the connection and open a fresh one (called after a failure)."""
        try:
            self._conn.close()
        except psycopg.Error:
            pass
        self._conn = psycopg.connect(DATABASE_URL, autocommit=True)


class DeviceRegistry:
    """In-memory cache of DevEUI -> (device_id, device_type)."""

    def __init__(self, db: Database) -> None:
        self._db = db
        self._cache: dict[str, tuple[int, str]] = {}

    def get(self, eui: str) -> tuple[int, str] | None:
        """Return (device_id, type) for ``eui``, or None if unregistered."""
        if eui in self._cache:
            return self._cache[eui]
        row = self._db.conn.execute(
            "SELECT id, type FROM devices WHERE eui = %s", (eui,)
        ).fetchone()
        if row is None:
            return None
        self._cache[eui] = (row[0], row[1])
        return self._cache[eui]

    def clear(self) -> None:
        self._cache.clear()


def parse_message(payload: bytes) -> tuple[str, bytes, datetime]:
    """Extract ``(dev_eui, frame_payload, timestamp)`` from a gateway message.

    Raises ``ValueError``/``KeyError`` on anything that is not a valid uplink.
    """
    data = json.loads(payload)

    raw = data.get("data")
    if not raw:
        raise ValueError("message has no 'data' field")

    # DevEUI lives in different places across ChirpStack v3 and v4.
    device_info = data.get("deviceInfo") or {}
    eui = device_info.get("devEui") or data.get("devEUI") or data.get("devEui")
    if not eui:
        raise ValueError("message has no devEUI")

    # Prefer the network server timestamp; fall back to 'now'.
    iso = data.get("time")
    ts = (
        datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if iso
        else datetime.now(timezone.utc)
    )

    return str(eui).lower(), base64.b64decode(raw), ts


def handle_message(db: Database, registry: DeviceRegistry, msg: mqtt.MQTTMessage) -> None:
    """Decode and persist a single MQTT message. Never raises."""
    try:
        eui, frame, ts = parse_message(msg.payload)
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        log.debug("Skipping non-uplink message on %s: %s", msg.topic, exc)
        return

    try:
        device = registry.get(eui)
    except psycopg.Error:
        log.exception("Database lookup failed for %s; reconnecting", eui)
        db.reset()
        registry.clear()
        return

    if device is None:
        log.warning("Unregistered device %s on %s — skipping", eui, msg.topic)
        return

    device_id, device_type = device
    try:
        metrics = decode(frame, device_type)
    except ValueError as exc:
        log.warning("Decode skipped for %s (%s): %s", eui, device_type, exc)
        return
    if not metrics:
        log.debug("No telemetry decoded for %s on %s", eui, msg.topic)
        return

    rows = [(ts, device_id, metric, value) for metric, value in metrics.items()]
    try:
        with db.conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO readings (time, device_id, metric, value) "
                "VALUES (%s, %s, %s, %s)",
                rows,
            )
    except psycopg.Error:
        log.exception("Insert failed for device %s; reconnecting", device_id)
        db.reset()
        return

    log.info("%s (%s): %s", eui, device_type, metrics)


def on_connect(client: mqtt.Client, userdata, flags, reason_code, properties) -> None:
    """(Re)subscribe to the uplink topic on every (re)connect."""
    client.subscribe(MQTT_TOPIC)


def on_message(client: mqtt.Client, userdata, msg: mqtt.MQTTMessage) -> None:
    db, registry = userdata
    handle_message(db, registry, msg)


def main() -> None:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    db = Database()
    registry = DeviceRegistry(db)

    # CallbackAPIVersion.VERSION2 is the modern paho-mqtt 2.x API.
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, userdata=(db, registry))
    client.on_connect = on_connect
    client.on_message = on_message
    # Reconnect with backoff if the broker is temporarily unreachable.
    client.reconnect_delay_set(min_delay=1, max_delay=30)

    log.info(
        "Ingest starting: host=%s port=%s topic=%s",
        MQTT_HOST, MQTT_PORT, MQTT_TOPIC,
    )
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    client.loop_forever()  # blocks and handles MQTT reconnects internally


if __name__ == "__main__":
    main()
