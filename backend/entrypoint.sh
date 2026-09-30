#!/bin/bash
set -e

echo "==> Running database migrations..."
alembic upgrade head

# Railway and other managed hosts inject $PORT; local Docker defaults to 8000.
PORT="${PORT:-8000}"

# Railway's private network is IPv6-only, so reaching this service via
# backend.railway.internal requires binding "::" (set UVICORN_HOST=:: there —
# on Linux that accepts IPv4 too, so public traffic keeps working).
# Local Docker networks have no IPv6 by default, hence the 0.0.0.0 fallback.
HOST="${UVICORN_HOST:-0.0.0.0}"

# RELOAD=1 enables uvicorn hot-reload for local development (set in docker-compose).
# Production leaves it unset — reload watches the filesystem and must never run live.
RELOAD_FLAG=""
if [ "${RELOAD:-0}" = "1" ]; then
  RELOAD_FLAG="--reload"
fi

echo "==> Starting FastAPI server on port ${PORT} (reload=${RELOAD:-0})..."
# --proxy-headers applies X-Forwarded-Proto so the app knows the request was HTTPS.
# NOTE: with "*" uvicorn also sets request.client to the first X-Forwarded-For
# entry, which behind Cloudflare is a rotating Cloudflare address, not the user.
# Never use request.client for security decisions; rate limiting uses
# app.core.rate_limit.client_ip, which reads X-Real-IP (set by Railway's edge).
exec uvicorn app.main:app --host "${HOST}" --port "${PORT}" ${RELOAD_FLAG} \
  --proxy-headers --forwarded-allow-ips="*" \
  --timeout-graceful-shutdown 3
