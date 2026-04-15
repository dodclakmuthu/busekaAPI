#!/usr/bin/env bash
set -Eeuo pipefail
set -a
source /var/www/dev-busapp-api/.env
set +a

exec /usr/bin/node /var/www/dev-busapp-api/dist/main.js