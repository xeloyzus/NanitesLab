# Raspberry Pi kiosk setup

Steps to turn a Raspberry Pi 5 (Raspberry Pi OS, 64-bit) into a hands-off
dashboard display. Run once per screen.

## 1. Hardware

- Raspberry Pi 5 with a **NVMe SSD via NVMe HAT** (do **not** use a microSD
  card — it is the main cause of kiosk failures under years of continuous use).
- Official/larger power adapter (27 W recommended) and a case with cooling.

## 2. Base OS

1. Flash Raspberry Pi OS Lite (64-bit) to the NVMe SSD.
2. Boot, enable SSH, and set a strong password (`sudo passwd pi`).
3. `sudo apt update && sudo apt full-upgrade -y`

## 3. Install the browser and watchdog deps

```bash
sudo apt install -y chromium-browser curl
# On Bookworm the package is "chromium" instead of "chromium-browser".
```

## 4. Install the kiosk service

```bash
sudo cp kiosk.service /etc/systemd/system/kiosk.service
# Edit ExecStart: confirm the chromium binary path and set the dashboard URL.
sudo systemctl daemon-reload
sudo systemctl enable --now kiosk.service
```

## 5. Watchdog

```bash
chmod +x watchdog.sh
crontab -e
# Add:
#   * * * * * /home/pi/naniteslab/kiosk/watchdog.sh
```

## 6. Automatic security updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

## 7. Tuning for a long-lived display

- Disable screen blanking/sleep: add `consoleblank=0` to `/boot/firmware/cmdline.txt`.
- If the panel is OLED, rotate content periodically to avoid burn-in (a future
  enhancement; not required for LCD).

## Notes

- `Restart=always` plus the cron watchdog covers both browser crashes and
  network drop-outs.
- Alternative: [Screenly OSE](https://www.screenly.io/ose/) provides a
  ready-made kiosk/watchdog with remote management of both screens, if that
  trade-off is preferred.
