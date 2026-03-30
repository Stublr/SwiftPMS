#!/usr/bin/env bash
set -euo pipefail

echo "=== SmartPOS Development Setup ==="

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required. Run: npm install -g pnpm@9"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker is required. Install from https://docker.com"; exit 1; }

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Start infrastructure
echo "Starting PostgreSQL, Redis, and MinIO..."
docker compose -f docker/docker-compose.yml up -d

# Wait for PostgreSQL
echo "Waiting for PostgreSQL..."
until docker compose -f docker/docker-compose.yml exec -T postgres pg_isready -U smartpos >/dev/null 2>&1; do
  sleep 1
done
echo "PostgreSQL is ready."

# Copy env files if they don't exist
if [ ! -f apps/api/.env ]; then
  cp apps/api/.env.example apps/api/.env
  echo "Created apps/api/.env from example"
fi

if [ ! -f apps/pos/.env ]; then
  cp apps/pos/.env.example apps/pos/.env
  echo "Created apps/pos/.env from example"
fi

# Build shared packages
echo "Building shared packages..."
pnpm build --filter="./packages/*"

# Run migrations
echo "Running database migrations..."
pnpm db:migrate

# Seed database
echo "Seeding database..."
pnpm db:seed

echo ""
echo "=== Setup Complete ==="
echo "Run 'pnpm dev' to start all services"
echo "  API:  http://localhost:3000"
echo "  POS:  http://localhost:5173"
