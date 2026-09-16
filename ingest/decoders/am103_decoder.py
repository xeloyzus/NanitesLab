"""Decode a Milesight AM103 (indoor air quality) LoRaWAN uplink payload.

Spec source:
https://github.com/Milesight-IoT/SensorDecoders/tree/main/am-series/am103
"""

from .common import Spec, iter_fields, read_int

# (channel, type) -> (length, metric, divisor, signed)
FIELDS: Spec = {
    (0x01, 0x75): (1, "battery",     1,  False),   # %
    (0x03, 0x67): (2, "temperature", 10, True),    # °C   (int16 / 10)
    (0x04, 0x68): (1, "humidity",    2,  False),   # %RH  (uint8 / 2)
    (0x07, 0x7D): (2, "co2",         1,  False),   # ppm  (uint16)
    # (0x20, 0xCE) is a 9-byte "history replay" block (timestamp + temp +
    # humidity + co2). It is intentionally not decoded: it re-sends past
    # samples after a reconnect, which would mis-time the "current" view.
}


def decode(payload: bytes) -> dict[str, float]:
    """Decode ``payload`` into a flat ``{metric: value}`` mapping."""
    result: dict[str, float] = {}
    for channel, kind, data in iter_fields(payload, FIELDS):
        _, metric, divisor, signed = FIELDS[(channel, kind)]
        result[metric] = read_int(data, signed) / divisor
    return result
