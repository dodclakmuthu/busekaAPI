#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")"

if [ ! -f package.json ]; then
	echo "package.json not found in deploy directory"
	exit 1
fi

# Always load .env if present so runtime and PM2 get the latest values.
if [ -f .env ]; then
	echo "Loading environment from .env..."
	set -a
	# shellcheck disable=SC1091
	source .env
	set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
	echo "DATABASE_URL is not set. Provide it in shell or .env"
	exit 1
fi

echo "Installing dependencies..."
npm ci --legacy-peer-deps

echo "Generating Prisma client..."
./node_modules/.bin/prisma generate

echo "Building backend..."
npm run build

# Prefer DIRECT_URL (admin user) for migration operations when available.
MIGRATION_BASE_URL="${DIRECT_URL:-$DATABASE_URL}"

echo "Ensuring busapp schema exists..."
PSQL_URL=$(DATABASE_URL="$MIGRATION_BASE_URL" python3 -c "
import os
from urllib.parse import urlparse, urlencode, urlunparse, parse_qs
u = urlparse(os.environ['DATABASE_URL'])
q = {k: v[0] for k, v in parse_qs(u.query).items() if k not in ('schema', 'pgbouncer', 'uselibpqcompat')}
print(urlunparse(u._replace(query=urlencode(q))))
")
if ! psql "$PSQL_URL" -c "CREATE SCHEMA IF NOT EXISTS busapp;"; then
	echo "Could not create schema with current DB user. Checking if schema already exists..."
	if psql "$PSQL_URL" -tAc "SELECT 1 FROM pg_namespace WHERE nspname = 'busapp'" | grep -q "1"; then
		echo "Schema busapp already exists. Continuing deployment."
	else
		echo "Schema busapp does not exist and DB user lacks permission to create it."
		echo "Ask your DB admin to run once: CREATE SCHEMA IF NOT EXISTS busapp AUTHORIZATION <db_user>;"
		exit 1
	fi
fi

echo "Applying Prisma migrations..."
MIGRATE_DATABASE_URL=$(DATABASE_URL="$MIGRATION_BASE_URL" python3 -c "
import os
from urllib.parse import urlparse, urlencode, urlunparse, parse_qs
u = urlparse(os.environ['DATABASE_URL'])
q = {k: v[0] for k, v in parse_qs(u.query).items() if k not in ('schema',)}
q['schema'] = 'busapp'
print(urlunparse(u._replace(query=urlencode(q))))
")
DATABASE_URL="$MIGRATE_DATABASE_URL" ./node_modules/.bin/prisma migrate deploy

echo "Deploy preparation complete."

echo "Restarting application process..."

if systemctl list-unit-files | grep -q '^buseka-api\.service'; then
	echo "Restarting systemd unit: buseka-api"
	sudo systemctl restart buseka-api
elif systemctl list-unit-files | grep -q '^busapp-api\.service'; then
	echo "Restarting systemd unit: busapp-api"
	sudo systemctl restart busapp-api
elif command -v pm2 >/dev/null 2>&1; then
	echo "Restarting PM2 app: buseka-api"
	if pm2 restart buseka-api --update-env; then
		echo "PM2 app buseka-api restarted."
	elif pm2 restart busapp-api --update-env; then
		echo "PM2 app busapp-api restarted."
	elif [ -f ecosystem.config.js ]; then
		echo "PM2 app not found. Starting from ecosystem.config.js..."
		pm2 start ecosystem.config.js --only buseka-api --update-env || pm2 start ecosystem.config.js --only busapp-api --update-env
	else
		echo "PM2 app not found and ecosystem.config.js is missing."
		exit 1
	fi
	pm2 save >/dev/null 2>&1 || true
else
	echo "No known service manager target found. Restart manually."
	exit 1
fi