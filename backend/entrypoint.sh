#!/bin/bash
set -e

echo "==> Running database migrations..."
alembic upgrade head

# Railway and other managed hosts inject $PORT; local Docker defaults to 8000.
PORT="${PORT:-8000}"

# RELOAD=1 enables uvicorn hot-reload for local development (set in docker-compose).
# Production leaves it unset — reload watches the filesystem and must never run live.
RELOAD_FLAG=""
if [ "${RELOAD:-0}" = "1" ]; then
  RELOAD_FLAG="--reload"
fi

echo "==> Starting FastAPI server on port ${PORT} (reload=${RELOAD:-0})..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}" ${RELOAD_FLAG} --timeout-graceful-shutdown 3
