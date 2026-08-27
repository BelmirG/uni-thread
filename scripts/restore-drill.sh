#!/usr/bin/env bash
#
# Restores a production dump into a throwaway PostgreSQL 18 container so you can
# verify the backup works — and then browse the restored data in psql or a GUI
# client before throwing it away.
#
# Usage:
#   ./scripts/restore-drill.sh ~/Downloads/unithread-2026-08-10.dump
#
# Get a dump from the Cloudflare dashboard: R2 > unithread-backups > download
# the newest object. (Or run the "Backup restore drill" GitHub Action, which
# does all of this automatically and needs no local credentials.)
#
# SAFETY: this only ever touches its own container (see CONTAINER below) on its
# own port. It never connects to the docker-compose stack, and never touches the
# iusconnect development database.

set -euo pipefail

CONTAINER="unithread-restore-drill"
PORT=55432                 # deliberately not 5432 — that's the dev stack
PASSWORD="drillpassword"   # throwaway container, never reachable off this machine
DB="drill"
MIN_TABLES=21

DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  echo "Usage: $0 <path-to-dump-file>" >&2
  exit 1
fi
if [ ! -f "$DUMP" ]; then
  echo "Error: no such file: $DUMP" >&2
  exit 1
fi

SIZE=$(wc -c < "$DUMP" | tr -d ' ')
echo "==> Dump: $DUMP (${SIZE} bytes)"
if [ "$SIZE" -lt 10000 ]; then
  echo "Error: dump is only ${SIZE} bytes — almost certainly truncated." >&2
  exit 1
fi

cleanup_existing() {
  if docker ps -aq -f "name=^${CONTAINER}$" | grep -q .; then
    echo "==> Removing a leftover drill container from a previous run"
    docker rm -f "$CONTAINER" >/dev/null
  fi
}
cleanup_existing

echo "==> Starting throwaway PostgreSQL 18 on port ${PORT}"
# 18 matches production; pg_restore must be at least as new as the server that
# produced the dump.
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD="$PASSWORD" \
  -e POSTGRES_DB="$DB" \
  -p "${PORT}:5432" \
  postgres:18 >/dev/null

echo -n "==> Waiting for it to accept connections"
for i in $(seq 1 45); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d "$DB" >/dev/null 2>&1; then
    echo " ready (${i}s)"
    break
  fi
  echo -n "."
  sleep 1
  if [ "$i" -eq 45 ]; then
    echo
    echo "Error: database never became ready." >&2
    docker logs "$CONTAINER" >&2
    exit 1
  fi
done

echo "==> Restoring"
docker cp "$DUMP" "${CONTAINER}:/tmp/restore.dump"
# --exit-on-error so a partial restore is a failure. Without it pg_restore
# prints errors and still exits 0, and a half-broken backup would "pass".
docker exec "$CONTAINER" pg_restore \
  --username=postgres --dbname="$DB" \
  --no-owner --no-privileges --exit-on-error \
  /tmp/restore.dump
echo "    pg_restore completed with no errors."

q() { docker exec "$CONTAINER" psql -U postgres -d "$DB" -tAc "$1"; }

echo "==> Verifying"
TABLES=$(q "SELECT count(*) FROM information_schema.tables
            WHERE table_schema='public' AND table_type='BASE TABLE';")
echo "    tables:      $TABLES (expected >= $MIN_TABLES)"
[ "$TABLES" -ge "$MIN_TABLES" ] || { echo "FAILED: incomplete schema." >&2; exit 1; }

VERSION=$(q "SELECT version_num FROM alembic_version;")
echo "    migration:   ${VERSION:-MISSING}"
[ -n "$VERSION" ] || { echo "FAILED: alembic_version empty." >&2; exit 1; }

USERS=$(q "SELECT count(*) FROM users;")
echo "    users:       $USERS"
[ "$USERS" -ge 1 ] || { echo "FAILED: no rows restored." >&2; exit 1; }

FKS=$(q "SELECT count(*) FROM information_schema.table_constraints
         WHERE constraint_type='FOREIGN KEY' AND table_schema='public';")
echo "    foreign keys: $FKS"
[ "$FKS" -ge 1 ] || { echo "FAILED: constraints missing." >&2; exit 1; }

echo
echo "==> Row counts"
docker exec "$CONTAINER" psql -U postgres -d "$DB" -c "
  SELECT relname AS table_name, n_live_tup AS approx_rows
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC;"

cat <<EOF

✅ Restore drill passed — this backup is recoverable.

The restored copy is still running so you can inspect it:

  psql:  docker exec -it ${CONTAINER} psql -U postgres -d ${DB}

  GUI:   host localhost   port ${PORT}
         database ${DB}   user postgres   password ${PASSWORD}

When finished, throw it away:

  docker rm -f ${CONTAINER}

EOF
