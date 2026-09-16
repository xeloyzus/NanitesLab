#!/usr/bin/env bash
# Start (or update) the NanitesLab stack.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — edit it and re-run."
  exit 1
fi

docker compose up -d --build
