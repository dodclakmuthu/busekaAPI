#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/var/www/buseka-api"
ENV_FILE="$APP_DIR/.env"
ENTRYPOINT="$APP_DIR/dist/main.js"

cd "$APP_DIR"

# Allow systemd-provided environment variables when .env is not present.
if [ -f "$ENV_FILE" ]; then
	set -a
	# shellcheck disable=SC1090
	source "$ENV_FILE"
	set +a
else
	echo "[start.sh] Warning: $ENV_FILE not found. Continuing with existing environment."
fi

if [ ! -f "$ENTRYPOINT" ]; then
	echo "[start.sh] Error: $ENTRYPOINT not found. Build the project before starting the service."
	exit 1
fi

exec /usr/bin/node "$ENTRYPOINT"