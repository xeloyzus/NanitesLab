"""Decode a Milesight CT305 (3-phase current transformer) LoRaWAN payload.

Spec source:
https://github.com/Milesight-IoT/SensorDecoders/tree/main/ct-series/ct305
"""

from .common import Spec, iter_fields, read_int

# (channel, type) -> (length, metric, divisor, signed)
FIELDS: Spec = {
    (0x03, 0x97): (4, "total_1",    100, False),   # CHN1 total current, Ah (uint32 / 100)
    (0x04, 0x99): (2, "current_1",   10, False),   # CHN1 current, A      (uint16 / 10)
    (0x05, 0x97): (4, "total_2",    100, False),   # CHN2 total current, Ah
    (0x06, 0x99): (2, "current_2",   10, False),   # CHN2 current, A
    (0x07, 0x97): (4, "total_3",    100, False),   # CHN3 total current, Ah
    (0x08, 0x99): (2, "current_3",   10, False),   # CHN3 current, A
    (0x09, 0x67): (2, "temperature", 10, True),    # panel temperature, °C (int16 / 10)
    # Alarm records (0x84/0x86/0x88/0x89) are event notifications, not regular
    # telemetry, so they are intentionally ignored here.
}

# Sentinel the sensor emits for a 2-byte current field it could not read.
_READ_FAILED = 0xFFFF


def decode(payload: bytes) -> dict[str, float]:
    """Decode ``payload`` into a flat ``{metric: value}`` mapping.

    Current fields reporting the "read failed" sentinel are omitted.
    """
    result: dict[str, float] = {}
    for channel, kind, data in iter_fields(payload, FIELDS):
        _, metric, divisor, signed = FIELDS[(channel, kind)]
        raw = read_int(data, signed)
        if kind == 0x99 and raw == _READ_FAILED:
            continue  # sensor could not read this channel
        result[metric] = raw / divisor
    return result
