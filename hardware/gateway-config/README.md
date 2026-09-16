# UG65 gateway configuration

Each UG65 gateway runs an embedded LoRaWAN network server that forwards uplinks
over MQTT. Point it at the NanitesLab Mosquitto broker.

## MQTT integration

On each gateway (Network Server → MQTT):

| Setting            | Value                             |
| ------------------ | --------------------------------- |
| Broker address     | the VPS public IP / hostname      |
| Broker port        | `1883`                            |
| Protocol           | MQTT (TCP)                        |
| Topic prefix       | `application/1/device/` (or as configured) |

The ingest subscribes to `MQTT_TOPIC` (default `#`), so it will pick up any
topic layout. If you later narrow `MQTT_TOPIC`, keep the gateway topic prefix
consistent with it.

## Device registration

The ingest only stores data for devices that exist in the `devices` table.
After a sensor joins the network, register it with its DevEUI, e.g.:

```sql
INSERT INTO devices (eui, building_id, type, label, room)
VALUES ('24e124128b123456', 1, 'am103', 'Library — Reading room 1', '2nd floor');
```

The DevEUI is printed on the sensor label and shown in the gateway's device
list. Use the building IDs from `db/init.sql` (1 = Kjølv Egelands hus,
2 = Library, 3 = Arne Rettedals hus).

## Uplink settings

- Confirm each sensor is set to report every **15 minutes**.
- Do **not** enable Milesight IoT Cloud — data goes directly to the custom
  backend via MQTT (IoT Cloud has no export API).
