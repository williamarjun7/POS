-- ============================================================================
-- PostgreSQL Performance Profiling
-- ============================================================================
--
-- Run these queries against your InsForge database to identify:
--   - Slow queries (>100ms execution time)
--   - Missing indexes
--   - Lock waits
--   - Sequential scans
--   - N+1 query patterns
--   - Connection pool usage
--
-- Usage (via InsForge dashboard SQL editor or psql):
--   psql "$DATABASE_URL" -f tests/db/performance-profiling.sql
-- ============================================================================

-- ─── 1. Slow Queries (requires pg_stat_statements) ─────────────

-- First, ensure pg_stat_statements is enabled:
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 20 slowest queries by total execution time
SELECT
  queryid,
  LEFT(query, 120) AS query_preview,
  calls,
  ROUND(total_exec_time::numeric, 2) AS total_time_ms,
  ROUND(mean_exec_time::numeric, 2) AS avg_time_ms,
  ROUND(min_exec_time::numeric, 2) AS min_time_ms,
  ROUND(max_exec_time::numeric, 2) AS max_time_ms,
  ROUND(stddev_exec_time::numeric, 2) AS stddev_ms,
  ROUND(100.0 * total_exec_time / SUM(total_exec_time) OVER (), 2) AS percentage,
  rows,
  shared_blks_hit,
  shared_blks_read
FROM pg_stat_statements
WHERE total_exec_time > 0
  AND query NOT LIKE '%pg_stat_statements%'
ORDER BY total_exec_time DESC
LIMIT 20;

-- Top 20 slowest queries by average execution time
SELECT
  queryid,
  LEFT(query, 120) AS query_preview,
  calls,
  ROUND(mean_exec_time::numeric, 2) AS avg_time_ms,
  ROUND(total_exec_time::numeric, 2) AS total_time_ms,
  rows,
  ROUND(rows::numeric / NULLIF(calls, 0), 2) AS avg_rows
FROM pg_stat_statements
WHERE calls > 10  -- Only queries called multiple times
  AND mean_exec_time > 100  -- Only queries over 100ms
ORDER BY mean_exec_time DESC
LIMIT 20;

-- ─── 2. Missing Indexes (Sequential Scans) ─────────────────────

-- Tables with the most sequential scans (potential missing indexes)
SELECT
  schemaname,
  relname AS table_name,
  seq_scan,
  seq_tup_read,
  idx_scan,
  ROUND(100.0 * idx_scan / NULLIF(seq_scan + idx_scan, 0), 2) AS idx_scan_pct,
  n_live_tup AS estimated_rows,
  ROUND(seq_tup_read::numeric / NULLIF(seq_scan, 0), 2) AS avg_rows_per_seq_scan
FROM pg_stat_user_tables
WHERE seq_scan > 10  -- At least 10 sequential scans
  AND (idx_scan = 0 OR idx_scan::numeric / NULLIF(seq_scan + idx_scan, 0) < 0.5)
ORDER BY seq_scan DESC
LIMIT 20;

-- ─── 3. Index Usage Analysis ────────────────────────────────────

-- Unused indexes (candidates for removal)
SELECT
  schemaname,
  tablename AS table_name,
  indexname AS index_name,
  idx_scan AS times_used,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE '%_pkey'  -- Don't suggest dropping primary keys
ORDER BY pg_relation_size(indexname::regclass) DESC;

-- Missing indexes (from pg_stat_statements + EXPLAIN analysis)
-- Look for tables frequently appearing in sequential scan results above

-- ─── 4. Lock Waits ─────────────────────────────────────────────

-- Currently blocked transactions
SELECT
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocked_activity.query AS blocked_query,
  blocked_locks.mode AS blocked_mode,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocking_activity.query AS blocking_query,
  blocking_locks.mode AS blocking_mode,
  NOW() - blocked_activity.query_start AS blocked_duration
FROM pg_catalog.pg_locks AS blocked_locks
JOIN pg_catalog.pg_stat_activity AS blocked_activity
  ON blocked_locks.pid = blocked_activity.pid
JOIN pg_catalog.pg_locks AS blocking_locks
  ON blocked_locks.locktype = blocking_locks.locktype
    AND blocked_locks.database IS NOT DISTINCT FROM blocking_locks.database
    AND blocked_locks.relation IS NOT DISTINCT FROM blocking_locks.relation
    AND blocked_locks.page IS NOT DISTINCT FROM blocking_locks.page
    AND blocked_locks.tuple IS NOT DISTINCT FROM blocking_locks.tuple
    AND blocked_locks.virtualxid IS NOT DISTINCT FROM blocking_locks.virtualxid
    AND blocked_locks.transactionid IS NOT DISTINCT FROM blocking_locks.transactionid
    AND blocked_locks.classid IS NOT DISTINCT FROM blocking_locks.classid
    AND blocked_locks.objid IS NOT DISTINCT FROM blocking_locks.objid
    AND blocked_locks.objsubid IS NOT DISTINCT FROM blocking_locks.objsubid
    AND blocked_locks.pid <> blocking_locks.pid
JOIN pg_catalog.pg_stat_activity AS blocking_activity
  ON blocking_locks.pid = blocking_activity.pid
WHERE NOT blocked_locks.granted;

-- ─── 5. Query Execution Plans (EXPLAIN ANALYZE) ────────────────

-- Run these to analyze specific critical queries:

-- Dashboard: Pending invoices query
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT *
FROM invoices
WHERE status NOT IN ('paid', 'refunded', 'cancelled')
ORDER BY created_at DESC
LIMIT 50;

-- Dashboard: Activity feed
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT *
FROM activity_logs
ORDER BY created_at DESC
LIMIT 10;

-- Menu: Items with category join
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT mi.*, mc.name AS category_name
FROM menu_items mi
LEFT JOIN menu_categories mc ON mi.category_id = mc.id
ORDER BY mi.name ASC
LIMIT 50;

-- Payments by method
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT payment_method, COUNT(*), SUM(amount)
FROM payments
WHERE created_at >= NOW() - INTERVAL '1 day'
GROUP BY payment_method;

-- Bookings: Active bookings for dashboard
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT *
FROM bookings
WHERE status IN ('confirmed', 'checked_in')
ORDER BY check_in ASC;

-- ─── 6. Repeated / Duplicate Queries ──────────────────────────

-- Top queries by frequency (potential N+1 or polling issues)
SELECT
  queryid,
  LEFT(query, 120) AS query_preview,
  calls,
  ROUND(total_exec_time::numeric, 2) AS total_time_ms,
  ROUND(mean_exec_time::numeric, 2) AS avg_time_ms,
  ROUND(total_exec_time::numeric / 1000, 2) AS total_time_seconds
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 20;

-- ─── 7. Connection Pool Usage ─────────────────────────────────

-- Current connection count by state
SELECT
  state,
  COUNT(*) AS count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY state
ORDER BY count DESC;

-- Idle in transaction (potential transaction leaks)
SELECT
  pid,
  usename,
  state,
  LEFT(query, 80) AS query,
  NOW() - query_start AS query_duration,
  NOW() - state_change AS state_duration
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY state_change ASC;

-- ─── 8. Table Bloat (dead tuples) ──────────────────────────────

-- Tables needing VACUUM
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS live_tuples,
  n_dead_tup AS dead_tuples,
  ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct,
  last_autovacuum,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE n_dead_tup > 100
  AND (n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0)) > 0.1
ORDER BY n_dead_tup DESC
LIMIT 15;

-- ─── 9. Cache Hit Ratio ────────────────────────────────────────

-- Overall cache hit ratio
SELECT
  'shared_buffer_hit_ratio' AS metric,
  ROUND(SUM(blks_hit) * 100.0 / NULLIF(SUM(blks_hit + blks_read), 0), 2) AS value
FROM pg_stat_database
WHERE datname = current_database()

UNION ALL

-- Index cache hit ratio
SELECT
  'index_cache_hit_ratio',
  ROUND(SUM(idx_blks_hit) * 100.0 / NULLIF(SUM(idx_blks_hit + idx_blks_read), 0), 2)
FROM pg_statio_user_indexes;
