# NanitesLab

Indoor climate and electricity monitoring for UiS Green Funds (14 Sep – 31 Dec 2026).

LoRaWAN sensors (Milesight AM103 air quality + CT305 current clamps) feed a
self-hosted stack that powers a public dashboard and kiosk displays in the
Library and a secondary building.

See [`technical-setup.md`](technical-setup.md) for the full system design.

## Architecture

```
[AM103 / CT305] --LoRaWAN--> [UG65 gateway] --MQTT--> [Mosquitto]
                                                            |
                                                            v
                                                      [ingest] --decode--> [TimescaleDB]
                                                                              |
                                                                              v
[Chrome kiosk + mobile] <--HTTPS-- [Caddy] <-- [FastAPI api] <----------------+
```

Data does **not** pass through Milesight IoT Cloud — the gateway's embedded
MQTT feed goes straight into the custom backend.

## Repository layout

```
naniteslab/
├── docker-compose.yml      # the whole stack
├── Caddyfile               # reverse proxy + automatic HTTPS
├── .env.example            # copy to .env and fill in
├── requirements-dev.txt    # test dependencies
├── run.sh                  # convenience launcher (VPS)
├── mosquitto/              # broker config
├── app/                    # FastAPI backend + frontend (layered)
│   ├── main.py             # app entrypoint
│   ├── dependencies.py     # get_db dependency
│   ├── core/               # settings (config.py)
│   ├── db/                 # connection pool + SQL migrations/
│   ├── internal/           # ops endpoints (health)
│   ├── routers/            # thin HTTP layer (API + pages)
│   ├── schemas/            # Pydantic response models
│   ├── services/           # business logic
│   ├── static/             # CSS / JS / images
│   └── templates/          # Jinja2 templates (base/index/mobile)
├── ingest/                 # MQTT -> decode -> TimescaleDB
├── tests/                  # pytest suite
├── kiosk/                  # Raspberry Pi kiosk service + watchdog
├── hardware/               # sensor placement + gateway config
├── docs/                   # application + Driftsenheten dialogue
└── report/                 # final report template
```

## Quick start

1. **Configure** — copy the env template and fill in secrets and your domain:

   ```bash
   cp .env.example .env
   # edit .env: POSTGRES_PASSWORD, DATABASE_URL, GRAFANA_ADMIN_PASSWORD, DOMAIN
   ```

   Use `DEMO_MODE=1` only for local UI previews. Production kiosks should run
   with `DEMO_MODE=0`, which makes FastAPI read from TimescaleDB populated by
   the MQTT ingest service.

2. **Point DNS** at the VPS (`DOMAIN`), then start the stack:

   ```bash
   docker compose up -d --build
   ```

   Caddy obtains a TLS certificate automatically. The dashboard is served at
   `https://<DOMAIN>/`, the mobile view at `https://<DOMAIN>/mobile`, and the
   API at `https://<DOMAIN>/api/...`.

3. **Register devices** as sensors join the network (see
   [`hardware/gateway-config/README.md`](hardware/gateway-config/README.md)):

   ```sql
   INSERT INTO devices (eui, building_id, type, label, room)
   VALUES ('24e124128b123456', 2, 'am103', 'Library — Reading room 1', '2nd floor');
   ```

## API

| Endpoint                          | Description                                   |
| --------------------------------- | --------------------------------------------- |
| `GET /api/buildings`              | list buildings                                |
| `GET /api/buildings/{id}/current` | latest value per metric for every sensor      |
| `GET /api/buildings/{id}/history` | downsampled history (`?range=1h\|24h\|7d\|30d`) |
| `GET /api/campus/summary`         | kiosk/overview aggregate contract             |
| `GET /api/methodology`            | transparent thresholds and recommendation rules |
| `GET /api/system/status`          | demo/live mode and kiosk refresh configuration |

## Storage

- ~13 devices reporting every 15 min ≈ 1,250 messages/day ≈ 200–300 MB/year.
- Raw readings kept 90 days, then rolled into hourly averages
  (`app/db/migrations/0002_retention.sql`). 20 GB of disk covers years of operation.

## Kiosk displays

See [`kiosk/setup.md`](kiosk/setup.md) for the Raspberry Pi install (NVMe SSD,
systemd Chromium kiosk with `Restart=always`, unattended-upgrades, cron
watchdog).

## Security notes

- `mosquitto.conf` starts with anonymous access for simplicity; enable a
  password file once the gateway IPs are known (instructions in the file).
- Grafana is bound to `127.0.0.1` only — reach it via an SSH tunnel.

## Long-term operation (through 2030)

The data is meant to inform a CO₂ plan over many years, so treat it as
infrastructure, not a one-off demo. The retention design already supports this:
raw readings roll into **hourly averages kept indefinitely**, so year-over-year
comparisons stay possible without unbounded disk growth.

Do these things, on a schedule, and it will keep running:

1. **Yearly maintenance pass** — bump the pinned image tags (below) deliberately
   and test, instead of letting `latest` surprise you:

   ```bash
   docker compose pull
   docker compose up -d
   ```

   Pinned tags to bump: `timescale/timescaledb`, `grafana/grafana` (and any you
   pin later). `caddy:2`, `eclipse-mosquitto:2` and `python:3.12-slim` float
   within a compatible line and self-update on the next `pull`.

2. **Backups** — the 7 years of data must survive disk failure. At this data
   volume (~300 MB/year, 90 days of raw + hourly rollup) a nightly `pg_dump`
   is more than enough. Add a cron that runs:

   ```bash
   docker compose exec -T timescaledb pg_dump -U naniteslab naniteslab | gzip > backups/naniteslab-$(date +%F).sql.gz
   ```

   …and copy the file off-site (e.g. `rclone` to an object store). Keep the
   last N dumps and prune older ones.

3. **OS security updates** on the VPS:

   ```bash
   sudo apt install -y unattended-upgrades
   sudo dpkg-reconfigure --priority=low unattended-upgrades
   ```

4. **Stable domain** — use one you will control for years (ideally under
   `uis.no`, an open item in `technical-setup.md`). Changing the domain later
   breaks the QR code, the kiosk URL, and any bookmarked link.

5. **Uptime monitoring** — point a free monitor (e.g. UptimeRobot) at
   `https://<DOMAIN>/health` and `https://<DOMAIN>/api/system/status`, and add
   a second check for `https://<DOMAIN>/api/buildings` so a failure is noticed
   within a day rather than when someone walks past a blank kiosk screen.

6. **Live sensor cutover checklist**

   - `DEMO_MODE=0`
   - `DATABASE_URL` points at the TimescaleDB service.
   - `docker compose ps` shows `mosquitto`, `ingest`, `timescaledb`, and `api` running.
   - `/api/system/status` returns `"mode": "live"` and `"data_source": "timescaledb"`.
   - `/api/buildings/{id}/current` has recent `updated` timestamps after a gateway uplink.
   - Kiosk header says `Live sensors`, not `Demo data`.

7. **Document the handover** — the people running this in year 3 will not be
   the people who set it up. Keep `README.md` + `kiosk/setup.md` current, and
   record where the VPS, domain and backups live.

