#!/usr/bin/env bash
set -Eeuo pipefail
set -a
source /var/www/buseka-api/.env
set +a

exec /usr/bin/node /var/www/buseka-api/dist/main.js