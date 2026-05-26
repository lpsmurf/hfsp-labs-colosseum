#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${DATABASE_PATH:-./data/bounty-vault.db}"
OUT_PATH="${PROOF_OUT:-./docs/TRANSACTIONS.md}"

mkdir -p "$(dirname "$OUT_PATH")"

{
  echo "# OOBE Bounty Transaction Proof"
  echo
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "## Summary"
  echo
  sqlite3 "$DB_PATH" <<'SQL'
.mode markdown
.headers on
SELECT
  COUNT(*) AS total_transactions,
  COUNT(DISTINCT service) AS distinct_services,
  ROUND(COALESCE(SUM(sol_amount), 0), 9) AS sol_spent,
  MIN(created_at) AS first_payment_at,
  MAX(created_at) AS last_payment_at
FROM payments
WHERE status = 'confirmed';
SQL
  echo
  echo "## Services"
  echo
  sqlite3 "$DB_PATH" <<'SQL'
.mode markdown
.headers on
SELECT
  service,
  COUNT(*) AS transactions,
  ROUND(COALESCE(SUM(sol_amount), 0), 9) AS sol_spent
FROM payments
WHERE status = 'confirmed'
GROUP BY service
ORDER BY service;
SQL
  echo
  echo "## Sample Transactions"
  echo
  sqlite3 "$DB_PATH" <<'SQL'
.mode markdown
.headers on
SELECT
  tx_signature,
  service,
  sol_amount,
  created_at
FROM payments
WHERE status = 'confirmed' AND tx_signature IS NOT NULL
ORDER BY created_at DESC
LIMIT 50;
SQL
  echo
  echo "## Signal Coverage"
  echo
  sqlite3 "$DB_PATH" <<'SQL'
.mode markdown
.headers on
SELECT
  service,
  COUNT(*) AS signals,
  MIN(created_at) AS first_signal_at,
  MAX(created_at) AS last_signal_at
FROM trading_signals
GROUP BY service
ORDER BY service;
SQL
} > "$OUT_PATH"

echo "Wrote $OUT_PATH"

