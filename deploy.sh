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
PSQL_URL=$(echo "$DATABASE_URL" | sed 's/[?&]schema=[^&]*//;s/[?&]pgbouncer=[^&]*//')
psql "$PSQL_URL" -c "CREATE SCHEMA IF NOT EXISTS busapp;"

echo "Applying Prisma migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Deploy preparation complete."

echo "Restarting buseka-api service..."

sudo systemctl restart buseka-api