#!/bin/sh
set -eu

MAX_RETRIES="${DB_MIGRATE_MAX_RETRIES:-30}"
SLEEP_SECONDS="${DB_MIGRATE_RETRY_DELAY_SECONDS:-2}"

attempt=1
while true; do
  echo "[backend-entrypoint] running prisma migrate deploy (attempt ${attempt}/${MAX_RETRIES})"
  if npm run prisma:migrate:deploy; then
    break
  fi

  if [ "$attempt" -ge "$MAX_RETRIES" ]; then
    echo "[backend-entrypoint] migrate failed after ${MAX_RETRIES} attempts"
    exit 1
  fi

  attempt=$((attempt + 1))
  sleep "$SLEEP_SECONDS"
done

echo "[backend-entrypoint] starting backend server"
exec node dist/src/server.js
