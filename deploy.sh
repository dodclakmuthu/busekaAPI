#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")"

if [ ! -f package.json ]; then
	echo "package.json not found in deploy directory"
	exit 1
fi

if [ -z "${DATABASE_URL:-}" ] && [ ! -f .env ]; then
	echo "DATABASE_URL is not set and .env is missing"
	exit 1
fi

# Load .env into shell if DATABASE_URL is not already exported
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
	set -a
	# shellcheck disable=SC1091
	source .env
	set +a
fi

echo "Installing dependencies..."
npm ci --legacy-peer-deps

echo "Generating Prisma client..."
./node_modules/.bin/prisma generate

echo "Building backend..."
npm run build

echo "Ensuring busapp schema exists..."
PSQL_URL=$(DATABASE_URL="$DATABASE_URL" python3 -c "
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
./node_modules/.bin/prisma migrate deploy

echo "Deploy preparation complete."

echo "Restarting buseka-api service..."

sudo systemctl restart buseka-api