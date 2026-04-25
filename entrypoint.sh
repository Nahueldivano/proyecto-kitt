#!/bin/sh
set -e

echo "Applying database schema..."
node ./node_modules/prisma/build/index.js db push --accept-data-loss

echo "Starting KITT..."
exec node server.js
