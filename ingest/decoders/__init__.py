"""Milesight payload decoders.

``decode`` dispatches on the device type registered in the database.
"""

from . import am103_decoder, ct305_decoder

_DECODERS = {
    "am103": am103_decoder.decode,
    "ct305": ct305_decoder.decode,
}


def decode(payload: bytes, device_type: str) -> dict[str, float]:
    """Decode ``payload`` for a device of ``device_type``.

    Returns a flat ``{metric: value}`` mapping, or ``{}`` when no telemetry is
    present. Raises ``ValueError`` for an unknown device type.
    """
    decoder = _DECODERS.get(device_type)
    if decoder is None:
        raise ValueError(f"unknown device type: {device_type!r}")
    return decoder(payload)
