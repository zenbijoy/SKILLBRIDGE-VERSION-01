#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/infra"
docker compose pull
docker compose build --pull
docker compose up -d
docker compose ps
