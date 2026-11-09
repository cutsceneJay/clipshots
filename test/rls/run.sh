#!/usr/bin/env bash
# Runs the privacy-rule tests against a throwaway local Postgres.
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | head -1); D=$(mktemp -d); chown postgres "$D" 2>/dev/null || true
run() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
run "$PGBIN/initdb -D $D -A trust >/dev/null && $PGBIN/pg_ctl -D $D -o '-p 5498 -k /tmp' -l $D/log start >/dev/null"
trap 'run "$PGBIN/pg_ctl -D $D stop -m fast >/dev/null"; rm -rf $D' EXIT
sleep 2; psql -h /tmp -p 5498 -U postgres -q -c "create database t"
psql -h /tmp -p 5498 -U postgres -d t -q -v ON_ERROR_STOP=1 -f test/rls/supabase-stub.sql $(for f in supabase/migrations/*.sql; do printf -- "-f %s " "$f"; done) -f test/rls/rls-test.sql 2>&1 | grep -E "PASS|FAIL|ERROR"
