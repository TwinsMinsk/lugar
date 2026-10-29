#!/bin/sh
# Runs inside the throwaway postgres:18 service that `npm run db:restore-check` creates (see
# restore-check.ts): dumps production over the private network, restores the dump into a cluster in
# this container and compares every table. Prints table names, row counts and hashes - never rows.
set -eu
echo "restore-check: start"
PGDATA=/tmp/pg
mkdir -p "$PGDATA" && chown postgres:postgres "$PGDATA"
gosu postgres initdb -D "$PGDATA" -A trust -U postgres >/dev/null
gosu postgres pg_ctl -D "$PGDATA" -o "-c listen_addresses=" -w start >/dev/null
L="-h /var/run/postgresql -U postgres"

# Private DNS can lag a freshly started container by a few seconds.
i=0
until pg_isready -d "$SRC" >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -ge 30 ] && { echo "RESULT: FAIL source unreachable"; exit 1; }
  sleep 2
done
echo "prod server: $(psql "$SRC" -Atc 'show server_version')"

t0=$(date +%s)
pg_dump "$SRC" -Fc -f /tmp/lugar.dump
echo "dump: $(( $(date +%s) - t0 ))s, $(du -h /tmp/lugar.dump | cut -f1)"

createdb $L lugar_restore_check
t0=$(date +%s)
if pg_restore $L -d lugar_restore_check --no-owner --no-acl /tmp/lugar.dump 2>/tmp/restore.err; then
  echo "restore: $(( $(date +%s) - t0 ))s, exit 0"
else
  echo "restore: $(( $(date +%s) - t0 ))s, exit $?"; head -20 /tmp/restore.err
fi
rm -f /tmp/lugar.dump

# Rows are hashed one by one and the hashes sorted, so the result depends on neither physical row
# order nor collation; the session settings pin how timestamps and numbers are rendered as text.
cat > /tmp/q.sql <<'EOF'
set timezone = 'UTC';
set datestyle = 'ISO, MDY';
set intervalstyle = 'postgres';
set extra_float_digits = 1;
select table_schema || '.' || table_name || ' ' ||
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text || ' ' ||
  coalesce((xpath('/row/h/text()', query_to_xml(format('select md5(string_agg(md5(x::text), '''' order by md5(x::text))) as h from %I.%I x', table_schema, table_name), false, true, '')))[1]::text, 'empty')
from information_schema.tables
where table_schema in ('public', 'drizzle') and table_type = 'BASE TABLE'
order by 1;
select 'zz.indexes ' || count(*) from pg_indexes where schemaname in ('public', 'drizzle');
select 'zz.constraints ' || count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname in ('public', 'drizzle');
EOF
psql "$SRC" -qAt -f /tmp/q.sql > /tmp/prod.txt
psql $L -d lugar_restore_check -qAt -f /tmp/q.sql > /tmp/copy.txt
echo "tables+checks: prod $(wc -l < /tmp/prod.txt), copy $(wc -l < /tmp/copy.txt)"
if diff /tmp/prod.txt /tmp/copy.txt; then
  echo "RESULT: OK every table identical (row count + content hash), indexes and constraints match"
else
  echo "RESULT: MISMATCH"
fi
cut -d' ' -f1,2 /tmp/copy.txt
echo "restore-check: done"
