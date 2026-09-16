# NanitesLab — Technical Setup

Full technical documentation for the sensor network, backend, dashboard, and display setup.
UiS Green Funds project, 14 Sep – 31 Dec 2026.

---

## 1. System Overview

```
[AM103 / CT305 sensors]  (10 + 2 spare AM103, 3× CT305)
        │  LoRaWAN
        ▼
[UG65 gateway, 1 per building]  (Kjølv Egelands hus / Library / Arne Rettedals hus)
        │  MQTT (gateway's embedded network server)
        ▼
[VPS — Docker Compose stack]
   ├── Mosquitto (MQTT broker)
   ├── ingest-service (Python, paho-mqtt) → decodes Milesight payloads
   ├── TimescaleDB (Postgres, time-series data)
   ├── api-service (FastAPI) → serves JSON to the frontend
   ├── Grafana (internal admin/debug view, not public)
   └── Nginx (reverse proxy, automatic HTTPS)
        │
        ▼
[NanitesLab dashboard — HTML/CSS/JS + Chart.js]
   ├── Displayed via Chrome kiosk mode on Raspberry Pi (Library + secondary building)
   └── Public link + QR code for mobile viewing
```

Data does **not** go through Milesight IoT Cloud (no export API, only 3 months of downloadable history). The gateway's embedded MQTT/HTTP API feeds directly into the custom backend instead.

---

## 2. Hardware

| Component | Model | Qty | Approx. price (NOK) |
|---|---|---|---|
| Indoor air quality sensor | Milesight AM103 | 12 (10 active + 2 spare) | ≈ 2,130/unit |
| Electricity clamp sensor | Milesight CT305 (500A, 3-phase) | 3 | ≈ 2,420/unit |
| Gateway | Milesight UG65 | 3 (1 per building) | ≈ 4,310/unit |
| Display driver | Raspberry Pi 5 8GB | 2 | 2,290/unit |
| — power adapter | Luxorparts 27W | 2 | 199/unit |
| — case w/ fan | Raspberry Pi SC1159 | 2 | 149/unit |
| — NVMe HAT (long-term reliability, replaces SD card) | Raspberry Pi NVMe HAT | 2 | 249.90/unit |
| — NVMe SSD (256GB) | any compatible model | 2 | ≈ 350–450/unit |

**Gateway placement:** central mid-floor/stairwell core per building — not the roof (worse signal path through all floors, plus weather exposure).

**Sensor placement:** 3–4 AM103 per building in high-use lecture halls/reading rooms/common areas; 1 CT305 per building on the main distribution panel (requires Driftsenheten access approval).

---

## 3. Repository / Code Structure

```
naniteslab/
├── docker-compose.yml
├── .env.example
├── README.md
│
├── ingest/                        # MQTT → database
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                    # subscribes to gateway MQTT topics
│   └── decoders/
│       ├── am103_decoder.py       # Milesight AM103 payload → JSON
│       └── ct305_decoder.py       # Milesight CT305 payload → JSON
│
├── api/                           # FastAPI — serves data to the frontend
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   ├── routers/
│   │   ├── buildings.py           # /api/buildings/{id}/current
│   │   └── history.py             # /api/buildings/{id}/history?range=24h
│   └── db.py                      # TimescaleDB connection
│
├── db/
│   ├── init.sql                   # table schema
│   └── retention_policy.sql       # downsampling: raw data 90 days → hourly averages
│
├── frontend/                      # Static dashboard (HTML/CSS/JS + Chart.js)
│   ├── index.html                 # main view (all 3 buildings, passive display)
│   ├── mobile.html                # simplified view for QR/phone
│   ├── js/
│   │   ├── charts.js
│   │   └── api-client.js
│   └── assets/
│       └── qr-code.svg
│
├── kiosk/                         # Raspberry Pi setup
│   ├── kiosk.service              # systemd service (Restart=always)
│   ├── watchdog.sh                # cron: checks Chromium/network are alive
│   └── setup.md                   # install steps for each Pi
│
├── hardware/
│   ├── sensor-placement.md
│   └── gateway-config/            # UG65 configuration per building
│
├── docs/
│   ├── application/                # application text, budget, timeline
│   └── driftsenheten-dialog.md
│
└── report/
    └── january-2027-report.md
```

---

## 4. Backend — Docker Compose Services

| Service | Role | Notes |
|---|---|---|
| `mosquitto` | MQTT broker | Receives data from the UG65 gateways |
| `ingest` | Python script | Decodes Milesight payloads, writes to TimescaleDB |
| `timescaledb` | Postgres + time-series extension | All sensor history |
| `api` | FastAPI | JSON endpoints for the frontend |
| `grafana` | Internal admin view | Not public — internal debugging only |
| `Nginx` | Reverse proxy | Automatic HTTPS, serves frontend + api |

**VPS requirements:** 1–2 vCPU, 1–2 GB RAM, 20 GB disk is comfortably enough (see storage estimate below). A EU-based provider like Hetzner is recommended — campus networks typically block inbound connections, which would break the public dashboard link.

---

## 5. Data Volume & Storage

- 13 active devices (10 AM103 + 3 CT305), reporting roughly every 15 minutes
- ≈ 1,250 messages/day total
- ≈ 200–300 MB/year of raw data
- Retention policy: raw data kept for 90 days, older data rolled into hourly averages — keeps the dashboard fast indefinitely

20 GB of disk covers several years of operation with comfortable margin, including Grafana, logs, and backups.

---

## 6. Raspberry Pi Kiosk Setup

- **Storage:** NVMe SSD via NVMe HAT — not microSD (avoids the main cause of Pi kiosk failures under years of continuous operation)
- **Kiosk mode:** `systemd` service launching Chromium in kiosk mode against the dashboard URL, with `Restart=always`
- **Security/updates:** `unattended-upgrades` enabled for automatic security patches
- **Monitoring:** simple cron-based watchdog checking that Chromium/network are alive, restarting if not
- **Alternative:** Screenly OSE (open-source digital signage platform) if a ready-made kiosk/watchdog solution with remote management of both screens is preferred

**Expected lifespan:** Raspberry Pi 5 has guaranteed production until at least January 2038 (key components through 2042). Real-world operational life under continuous IoT/kiosk use is typically 7–10 years, especially with NVMe storage and a proper power adapter — well beyond the project's funded lifetime.

---

## 7. Public Access

- **Screens (Library + secondary building):** Raspberry Pi → Chromium kiosk mode → `frontend/index.html`, passive view of all three buildings at once
- **Mobile/personal device:** QR code → `frontend/mobile.html`, served via Nginx over HTTPS
- **Internal debugging:** Grafana, accessible only to project participants (not publicly linked)

---

## 8. Open Items

- [ ] Confirm distribution panel access with Driftsenheten (follow-up email sent)
- [ ] Decide on hosting internally via UiS IT vs. external VPS (Hetzner)
- [ ] Domain/subdomain for the dashboard link (ideally under uis.no)
- [ ] Decide whether a third participant joins the project
