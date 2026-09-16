#!/usr/bin/env bash
# Watchdog: make sure the kiosk browser and network stay alive.
# Run from cron every minute:
#   * * * * * /home/pi/naniteslab/kiosk/watchdog.sh
set -u

DASHBOARD_URL="https://dashboard.example.com"

# 1. Network: can we actually reach the dashboard? Chromium's own retry logic
#    is unreliable in kiosk mode, so check it ourselves.
if ! curl --silent --fail --max-time 10 "$DASHBOARD_URL" >/dev/null 2>&1; then
  sudo systemctl restart kiosk.service
  exit 0
fi

# 2. Browser: is a Chromium kiosk process running?
if ! pgrep -f "chromium.*--kiosk" >/dev/null 2>&1; then
  sudo systemctl restart kiosk.service
fi
