#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma@6 migrate deploy

echo "Starting KITT..."
exec node server.js
