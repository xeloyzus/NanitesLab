"""Tests for the Milesight payload decoders (pure functions, no I/O)."""

from ingest.decoders import am103_decoder, ct305_decoder


def test_am103_full_example():
    # Official example: 017564 03671801 04686D 077DC501
    result = am103_decoder.decode(bytes.fromhex("0175640367180104686D077DC501"))
    assert result == {
        "battery": 100.0,
        "temperature": 28.0,
        "humidity": 54.5,
        "co2": 453.0,
    }


def test_ct305_total_current():
    assert ct305_decoder.decode(bytes.fromhex("039710270000")) == {"total_1": 100.0}


def test_ct305_current():
    assert ct305_decoder.decode(bytes.fromhex("0499B80B")) == {"current_1": 300.0}


def test_ct305_read_failed_sentinel_is_skipped():
    # 0xFFFF means the sensor could not read the channel -> omit it.
    assert ct305_decoder.decode(bytes.fromhex("0499FFFF")) == {}


def test_ct305_temperature():
    assert ct305_decoder.decode(bytes.fromhex("09671801")) == {"temperature": 28.0}


def test_ct305_combined_uplink():
    result = ct305_decoder.decode(
        bytes.fromhex(
            "0397102700000499B80B0597102700000699D0070797102700000899C40909671801"
        )
    )
    assert result == {
        "total_1": 100.0,
        "current_1": 300.0,
        "total_2": 100.0,
        "current_2": 200.0,
        "total_3": 100.0,
        "current_3": 250.0,
        "temperature": 28.0,
    }


def test_empty_payloads_do_not_raise():
    assert am103_decoder.decode(b"") == {}
    assert ct305_decoder.decode(b"") == {}
