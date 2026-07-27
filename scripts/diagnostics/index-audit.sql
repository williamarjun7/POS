-- ============================================================================
-- PostgreSQL Index Audit — Production Diagnostics
-- ────────────────────────────────────────────────────────────────────────────
-- ✅ READ-ONLY: Does NOT modify any data, schema, or indexes.
--
-- ⚠️  BEFORE RUNNING: Read the instructions below.
--
-- How to run:
--   psql "your-connection-string" -f scripts/diagnostics/index-audit.sql > audit-results.txt
-- or via InsForge CLI:
--   npx @insforge/cli db query < scripts/diagnostics/index-audit.sql
--
-- ⚠️  SECTION 6 (EXPLAIN ANALYZE) uses placeholder UUIDs.
--     Replace them with REAL UUIDs from your database for accurate plans.
--     Run the helper query at SECTION 6.0 first to get real UUIDs.
--
-- ⚠️  SECTION 5 requires pg_stat_statements extension.
--     If not installed, those queries will error. That's acceptable —
--     the rest of the script is unaffected.
--
-- ⚠️  SECTION 6 queries run EXPLAIN (ANALYZE, BUFFERS) which actually
--     EXECUTES the queries. On large tables this may read buffers.
--     They do NOT modify data, but they do consume I/O.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1: Complete Index Inventory
-- ════════════════════════════════════════════════════════════════════════════

-- 1a. Every index that currently exists, with type metadata
SELECT
  i.schemaname,
  i.tablename,
  i.indexname,
  i.indexdef,
  pg_relation_size(i.indexrelid) AS index_size_bytes,
  pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size_human,
  (SELECT reltuples::BIGINT FROM pg_class WHERE oid = i.indrelid) AS table_estimated_rows,
  pg_size_pretty(pg_total_relation_size(i.indrelid)) AS table_total_size_human
FROM pg_indexes i
WHERE i.schemaname = 'public'
ORDER BY i.tablename, i.indexname;

-- 1b. Which indexes are UNIQUE (includes PKs and explicit UNIQUE constraints)
SELECT
  n.nspname AS schema_name,
  t.relname AS table_name,
  i.relname AS index_name,
  ix.indisunique AS is_unique,
  ix.indisprimary AS is_primary_key,
  pg_get_indexdef(ix.indexrelid) AS index_definition
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
ORDER BY t.relname, i.relname;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2: Index Usage Statistics
-- ════════════════════════════════════════════════════════════════════════════

-- 2a. Live pg_stat_user_indexes — actual idx_scan counts
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, relname, indexrelname;

-- 2b. Server uptime and statistics age (critical for determining if idx_scan=0 is meaningful)
-- ⚠️ stats_reset may be NULL if never explicitly reset; defaults to server start time
SELECT
  pg_postmaster_start_time() AS server_start_time,
  now() - pg_postmaster_start_time() AS server_uptime_interval,
  date_trunc('second', now() - pg_postmaster_start_time()) AS server_uptime_formatted,
  COALESCE(
    (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()),
    pg_postmaster_start_time()
  ) AS stats_reset_time,
  now() - COALESCE(
    (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()),
    pg_postmaster_start_time()
  ) AS time_since_stats_reset;

-- 2c. Table-level statistics
SELECT
  relname AS table_name,
  n_live_tup AS estimated_live_rows,
  n_dead_tup AS estimated_dead_rows,
  n_mod_since_analyze AS rows_modified_since_last_analyze,
  last_analyze,
  last_autoanalyze,
  last_vacuum,
  last_autovacuum,
  seq_scan,
  seq_tup_read AS seq_tup_read,
  idx_scan AS total_idx_scan,
  idx_tup_fetch AS total_idx_tup_fetch,
  n_tup_ins AS inserts,
  n_tup_upd AS updates,
  n_tup_del AS deletes
FROM pg_stat_all_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3: Foreign Key + Index Coverage
-- ════════════════════════════════════════════════════════════════════════════

-- 3a. Every FK with its ON DELETE/UPDATE action and whether an index exists.
--     Uses generate_series element-by-element comparison on indkey rather than
--     text pattern matching to avoid false positives (column 1 vs column 12).
SELECT
  con.conname AS constraint_name,
  con.confdeltype AS on_delete_code,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete_action,
  CASE con.confupdtype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_update_action,
  child.relname AS child_table,
  parent.relname AS parent_table,
  (
    SELECT string_agg(a.attname, ', ' ORDER BY u.attposition)
    FROM pg_attribute a
    JOIN unnest(con.conkey) WITH ORDINALITY u(attnum, attposition) ON a.attnum = u.attnum
    WHERE a.attrelid = con.conrelid
  ) AS fk_columns,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_index pi
    WHERE pi.indrelid = con.conrelid
      -- Element-by-element: check if the first FK column matches the first index column
      AND (
        SELECT count(*)
        FROM generate_series(0, cardinality(con.conkey) - 1) AS g(pos)
        WHERE (pi.indkey::int2vector)[g.pos + 1] = con.conkey[g.pos + 1]
      ) = cardinality(con.conkey)
  ) THEN 'YES' ELSE 'NO' END AS has_matching_index,
  (
    SELECT string_agg(pi.indexrelid::regclass::text || ': ' || pg_get_indexdef(pi.indexrelid), '; ')
    FROM pg_index pi
    WHERE pi.indrelid = con.conrelid
      AND (
        SELECT count(*)
        FROM generate_series(0, cardinality(con.conkey) - 1) AS g(pos)
        WHERE (pi.indkey::int2vector)[g.pos + 1] = con.conkey[g.pos + 1]
      ) = cardinality(con.conkey)
  ) AS matching_indexes
FROM pg_constraint con
JOIN pg_class child ON child.oid = con.conrelid
JOIN pg_class parent ON parent.oid = con.confrelid
WHERE con.contype = 'f'
  AND con.conrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)
ORDER BY child.relname, con.conname;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4: Duplicate & Redundant Index Detection
-- ════════════════════════════════════════════════════════════════════════════

-- 4a. Exact duplicate indexes (same columns, same order, same table)
SELECT
  t.relname AS table_name,
  string_agg(DISTINCT i.indexrelid::regclass::text, ', ') AS duplicate_index_names,
  pg_get_indexdef(i.indexrelid) AS index_definition,
  count(*) AS duplicate_count
FROM pg_index i
JOIN pg_class t ON t.oid = i.indrelid
WHERE t.relnamespace = 'public'::regnamespace
  AND i.indisprimary = false
GROUP BY t.relname, i.indkey, i.indclass, i.indoption, i.indisunique, i.indpred
HAVING count(*) > 1
ORDER BY t.relname;

-- 4b. Left-prefix redundant indexes: find indexes whose columns start with the same
--     columns as another index on the same table (excluding PKs and partial indexes).
--
--     Uses generate_series to compare indkey column-by-column rather than text matching,
--     avoiding false positives (e.g. column 1 vs column 12).
--
--     Only checks non-partial indexes. Partial indexes have different row coverage and
--     are excluded from this redundancy check.
WITH index_cols AS (
  SELECT
    t.relname AS table_name,
    i.indexrelid,
    pg_get_indexdef(i.indexrelid) AS index_def,
    (
      SELECT string_agg(a.attname, ', ' ORDER BY g.ord)
      FROM pg_attribute a
      JOIN (SELECT unnest(i.indkey) WITH ORDINALITY AS attnum, ordinality AS ord) g
        ON a.attnum = g.attnum
        AND g.ord <= i.indnkeyatts
      WHERE a.attrelid = i.indrelid
    ) AS column_list,
    i.indnkeyatts AS num_key_cols
  FROM pg_index i
  JOIN pg_class t ON t.oid = i.indrelid
  WHERE t.relnamespace = 'public'::regnamespace
    AND i.indisprimary = false
    AND i.indpred IS NULL  -- exclude partial indexes (different coverage = different purpose)
)
SELECT
  a.table_name,
  a.index_def AS superset_index,
  b.index_def AS subset_index,
  a.num_key_cols AS superset_col_count,
  b.num_key_cols AS subset_col_count
FROM index_cols a
JOIN index_cols b ON a.table_name = b.table_name
  AND a.indexrelid <> b.indexrelid
  AND a.num_key_cols > b.num_key_cols
  -- Check that the first N columns of 'a' match ALL columns of 'b' element-by-element
  AND EXISTS (
    SELECT 1
    FROM generate_series(0, b.num_key_cols - 1) AS g(col_pos)
    HAVING bool_and(
      (a.indexrelid::pg_index).indkey[g.col_pos + 1] = (b.indexrelid::pg_index).indkey[g.col_pos + 1]
    )
  )
ORDER BY a.table_name, a.index_def, b.index_def;

-- 4c. Partial indexes that are redundant with full indexes on the same column(s)
SELECT
  pi.relname AS table_name,
  pg_get_indexdef(full_i.indexrelid) AS full_index,
  pg_get_indexdef(partial_i.indexrelid) AS partial_index,
  pg_get_expr(partial_i.indpred, partial_i.indrelid) AS partial_condition
FROM pg_index full_i
JOIN pg_index partial_i
  ON full_i.indrelid = partial_i.indrelid
  AND full_i.indisprimary = false
  AND partial_i.indisprimary = false
  AND full_i.indkey = partial_i.indkey
  AND full_i.indpred IS NULL
  AND partial_i.indpred IS NOT NULL
JOIN pg_class pi ON pi.oid = partial_i.indrelid
WHERE pi.relnamespace = 'public'::regnamespace;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 5: Top Queries by Execution Frequency (requires pg_stat_statements)
-- ════════════════════════════════════════════════════════════════════════════

-- 5a. Most frequently executed queries involving your tables
-- ⚠️  REQUIRES pg_stat_statements extension. If not installed, this query will error.
--     That's acceptable — the rest of the script continues unaffected.
--     Filter: only SELECT queries on application tables (not system queries).
SELECT
  queryid,
  LEFT(query, 200) AS query_preview,
  calls,
  mean_exec_time::NUMERIC(10,2) AS avg_ms,
  total_exec_time::NUMERIC(10,2) AS total_ms,
  rows,
  shared_blks_hit + shared_blks_read AS total_buffers,
  shared_blks_read AS disk_reads,
  (100.0 * shared_blks_read / NULLIF(shared_blks_hit + shared_blks_read, 0))::NUMERIC(5,1) AS disk_hit_ratio_pct
FROM pg_stat_statements
WHERE LEFT(query, 1) = 'S'  -- only SELECT queries
  AND (query LIKE '%invoices%' OR query LIKE '%payments%' OR query LIKE '%order_batch%'
    OR query LIKE '%customers%' OR query LIKE '%bookings%' OR query LIKE '%rooms%'
    OR query LIKE '%expenses%' OR query LIKE '%menu_items%' OR query LIKE '%table_sessions%'
    OR query LIKE '%activity_logs%')
ORDER BY total_exec_time DESC
LIMIT 50;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 6: EXPLAIN (ANALYZE, BUFFERS) for Critical Queries
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️  SECTION 6.0: HELPER — Get real UUIDs from your database to use below.
--     Replace the placeholder UUIDs in 6b-6m with real values for accurate plans.
-- ============================================================================

-- 6.0: Sample real UUIDs from each table (run this first, then substitute below)
SELECT 'invoices' AS tbl, id, table_id, customer_id FROM invoices WHERE table_id IS NOT NULL LIMIT 3
UNION ALL SELECT 'order_batches', id, table_id, NULL FROM order_batches WHERE table_id IS NOT NULL LIMIT 3
UNION ALL SELECT 'payments', id, invoice_id, NULL FROM payments WHERE invoice_id IS NOT NULL LIMIT 3
UNION ALL SELECT 'customers', id, NULL, NULL FROM customers LIMIT 3
UNION ALL SELECT 'bookings', id, room_id, NULL FROM bookings WHERE room_id IS NOT NULL LIMIT 3
UNION ALL SELECT 'rooms', id, NULL, NULL FROM rooms LIMIT 3;

-- ════════════════════════════════════════════════════════════════════════════

-- 6a. Dashboard revenue query (date range + status filter)
-- ════════════════════════════════════════════════════════════════════════════
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT total, created_at
FROM public.invoices
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND created_at <= NOW()
  AND status IN ('paid', 'partial');

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT total, created_at
FROM public.invoices
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND created_at <= NOW()
  AND status IN ('paid', 'partial');

-- 6b. Payment method breakdown
-- ════════════════════════════════════════════════════════════════════════════
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT payment_method, amount
FROM public.payments
WHERE created_at >= NOW() - INTERVAL '7 days'
  AND created_at <= NOW();

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT payment_method, amount
FROM public.payments
WHERE created_at >= NOW() - INTERVAL '7 days'
  AND created_at <= NOW();

-- 6c. Simulate process_payment STEP 2: find existing invoice for table
-- ⚠️  REPLACE the UUID below with a REAL UUID from SECTION 6.0 output
-- ════════════════════════════════════════════════════════════════════════════
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, invoice_number
FROM public.invoices
WHERE table_id = 'REPLACE_WITH_REAL_UUID'::UUID
  AND status IN ('partial', 'credit_invoice')
ORDER BY created_at DESC
LIMIT 1;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, invoice_number
FROM public.invoices
WHERE table_id = 'REPLACE_WITH_REAL_UUID'::UUID
  AND status IN ('partial', 'credit_invoice')
ORDER BY created_at DESC
LIMIT 1;

-- 6d. Fetch active batches for a dashboard table
-- ⚠️  REPLACE the UUID below with a REAL UUID from SECTION 6.0 output
-- ════════════════════════════════════════════════════════════════════════════
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, table_id, customer_name, subtotal, paid_amount, status, created_at
FROM public.order_batches
WHERE table_id = 'REPLACE_WITH_REAL_UUID'::UUID
  AND status NOT IN ('paid', 'cancelled');

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, table_id, customer_name, subtotal, paid_amount, status, created_at
FROM public.order_batches
WHERE table_id = 'REPLACE_WITH_REAL_UUID'::UUID
  AND status NOT IN ('paid', 'cancelled');

-- 6e. Customer invoice lookup
-- ⚠️  REPLACE the UUID below with a REAL UUID from SECTION 6.0 output
-- ════════════════════════════════════════════════════════════════════════════
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, total, discount, status
FROM public.invoices
WHERE customer_id = 'REPLACE_WITH_REAL_UUID'::UUID;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, total, discount, status
FROM public.invoices
WHERE customer_id = 'REPLACE_WITH_REAL_UUID'::UUID;

-- 6f. Payment lookup by invoice
-- ⚠️  REPLACE the UUID below with a REAL UUID from SECTION 6.0 output
-- ════════════════════════════════════════════════════════════════════════════
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, invoice_id, amount, payment_method
FROM public.payments
WHERE invoice_id = ANY(ARRAY['REPLACE_WITH_REAL_UUID'::UUID]);

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, invoice_id, amount, payment_method
FROM public.payments
WHERE invoice_id = ANY(ARRAY['REPLACE_WITH_REAL_UUID'::UUID]);

-- 6g. Fetch order_batch_items for payment processing
-- ⚠️  REPLACE the UUID below with a REAL UUID from SECTION 6.0 output
-- ════════════════════════════════════════════════════════════════════════════
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT batch_id, COUNT(*) FILTER (WHERE status IN ('paid','credit','cancelled','voided')) AS settled_count,
       COUNT(*) FILTER (WHERE status IN ('paid','credit')) AS paid_count,
       COUNT(*) AS total_count
FROM public.order_batch_items
WHERE batch_id = ANY(ARRAY['REPLACE_WITH_REAL_UUID'::UUID])
GROUP BY batch_id;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT batch_id, COUNT(*) FILTER (WHERE status IN ('paid','credit','cancelled','voided')) AS settled_count,
       COUNT(*) FILTER (WHERE status IN ('paid','credit')) AS paid_count,
       COUNT(*) AS total_count
FROM public.order_batch_items
WHERE batch_id = ANY(ARRAY['REPLACE_WITH_REAL_UUID'::UUID])
GROUP BY batch_id;

-- 6h. Active table sessions lookup
-- ════════════════════════════════════════════════════════════════════════════
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ts.id AS session_id, ts.table_id, rt.table_number
FROM public.table_sessions ts
JOIN public.restaurant_tables rt ON rt.id = ts.table_id
WHERE ts.status = 'active'
ORDER BY ts.start_time ASC;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT ts.id AS session_id, ts.table_id, rt.table_number
FROM public.table_sessions ts
JOIN public.restaurant_tables rt ON rt.id = ts.table_id
WHERE ts.status = 'active'
ORDER BY ts.start_time ASC;

-- 6i. Booking lookup by room
-- ⚠️  REPLACE the UUID below with a REAL UUID from SECTION 6.0 output
-- ════════════════════════════════════════════════════════════════════════════
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, guest_name, status, check_in, check_out
FROM public.bookings
WHERE room_id = 'REPLACE_WITH_REAL_UUID'::UUID
ORDER BY created_at DESC;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, guest_name, status, check_in, check_out
FROM public.bookings
WHERE room_id = 'REPLACE_WITH_REAL_UUID'::UUID
ORDER BY created_at DESC;

-- 6j. All restaurant tables (dashboard load)
-- ════════════════════════════════════════════════════════════════════════════
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, table_number, capacity, section, display_order, status
FROM public.restaurant_tables
ORDER BY display_order ASC NULLS FIRST, table_number ASC;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, table_number, capacity, section, display_order, status
FROM public.restaurant_tables
ORDER BY display_order ASC NULLS FIRST, table_number ASC;

-- 6k. Customer list (all customers)
-- ════════════════════════════════════════════════════════════════════════════
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, name, phone, email, address, last_visit, notes
FROM public.customers
ORDER BY name ASC;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, name, phone, email, address, last_visit, notes
FROM public.customers
ORDER BY name ASC;

-- 6l. Expense list (date range)
-- ════════════════════════════════════════════════════════════════════════════
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT description, category, amount, quantity, unit, date, payment_method, recorded_by, notes
FROM public.expenses
ORDER BY date DESC, created_at DESC;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT description, category, amount, quantity, unit, date, payment_method, recorded_by, notes
FROM public.expenses
ORDER BY date DESC, created_at DESC;

-- 6m. Activity feed (dashboard)
-- ════════════════════════════════════════════════════════════════════════════
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, activity_type, entity_id, entity_label, status, location, amount, created_at, user_name
FROM public.activity_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, activity_type, entity_id, entity_label, status, location, amount, created_at, user_name
FROM public.activity_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 50;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 7: Index Size Report (for cost-benefit analysis)
-- ════════════════════════════════════════════════════════════════════════════

SELECT
  i.relname AS table_name,
  i.indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size,
  pg_size_pretty(pg_total_relation_size(i.relid)) AS table_total_size,
  ROUND(100 * pg_relation_size(i.indexrelid) / NULLIF(pg_total_relation_size(i.relid), 0), 1) AS pct_of_table,
  i.idx_scan AS lifetime_scans,
  CASE WHEN i.idx_scan = 0 THEN '⚠️ ZERO SCANS'
       WHEN i.idx_scan < 10 THEN 'Low usage'
       WHEN i.idx_scan < 100 THEN 'Moderate usage'
       ELSE 'Heavy usage'
  END AS usage_category
FROM pg_stat_user_indexes i
WHERE i.schemaname = 'public'
  AND pg_relation_size(i.indexrelid) > 0
ORDER BY pg_relation_size(i.indexrelid) DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 8: Targeted Analysis for Specific Indexes of Interest
-- ════════════════════════════════════════════════════════════════════════════

-- 8a. Specifically check the 6 indexes identified as potential drop candidates
SELECT
  indexrelname,
  relname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size,
  CASE
    WHEN idx_scan = 0 THEN 'CANDIDATE — zero scans'
    WHEN idx_scan < 10 THEN 'LOW USAGE — verify'
    ELSE 'ACTIVE — keep'
  END AS assessment
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND indexrelname IN (
    'idx_invoices_created',
    'idx_order_batch_items_batch',
    'idx_inventory_stock',
    'idx_inventory_category',
    'idx_order_batch_items_status',
    'idx_order_batches_table'
  )
ORDER BY indexrelname;

-- 8b. Specifically check the 12 recreated FK indexes
SELECT
  indexrelname,
  relname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size,
  CASE
    WHEN idx_scan = 0 THEN 'Zero scans — monitor'
    WHEN idx_scan < 10 THEN 'Low usage — expected for FK'
    ELSE 'Active — doing its job'
  END AS assessment
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND indexrelname IN (
    'idx_invoices_user_id',
    'idx_payments_user_id',
    'idx_expenses_recorded_by',
    'idx_order_batch_items_voided_by',
    'idx_bookings_user_id',
    'idx_table_sessions_closed_by',
    'idx_restaurant_tables_branch_id',
    'idx_order_batches_user_id',
    'idx_invoices_booking_id',
    'idx_bookings_room_id',
    'idx_rooms_room_type_id',
    'idx_rooms_branch_id'
  )
ORDER BY idx_scan ASC;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 9: Tables with no indexes at all (gap analysis)
-- ════════════════════════════════════════════════════════════════════════════

SELECT
  t.relname AS table_name,
  pg_size_pretty(pg_total_relation_size(t.oid)) AS total_size,
  (SELECT reltuples::BIGINT FROM pg_class WHERE oid = t.oid) AS estimated_rows
FROM pg_class t
WHERE t.relnamespace = 'public'::regnamespace
  AND t.relkind = 'r'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i WHERE i.indrelid = t.oid AND i.indisprimary = false
  )
ORDER BY t.relname;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 10: Candidate indexes from index_scan = 0 (EXCLUDING PKs and UNIQUE)
-- ════════════════════════════════════════════════════════════════════════════

SELECT
  u.indexrelname,
  u.relname,
  u.idx_scan,
  ix.indisunique,
  ix.indisprimary,
  pg_size_pretty(pg_relation_size(u.indexrelid)) AS size,
  CASE
    WHEN ix.indisprimary THEN 'PRIMARY KEY — never drop'
    WHEN ix.indisunique THEN 'UNIQUE constraint — never drop'
    ELSE 'Non-constraint — assess for removal'
  END AS constraint_type
FROM pg_stat_user_indexes u
JOIN pg_index ix ON ix.indexrelid = u.indexrelid
WHERE u.schemaname = 'public'
  AND u.idx_scan = 0
ORDER BY pg_relation_size(u.indexrelid) DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 11: Estimation of total index bloat
-- ════════════════════════════════════════════════════════════════════════════

SELECT
  sum(pg_relation_size(indexrelid)) AS total_index_bytes,
  pg_size_pretty(sum(pg_relation_size(indexrelid))) AS total_index_size,
  count(*) AS total_index_count
FROM pg_stat_user_indexes
WHERE schemaname = 'public';

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 12: Current Workload Snapshot
-- ════════════════════════════════════════════════════════════════════════════
-- Shows whether the database is under active load during the test.
-- If most connections are idle, the idx_scan counters reflect cumulative
-- usage, not current activity — which is fine for this audit.

SELECT
  state,
  count(*) AS connection_count,
  CASE
    WHEN state = 'active' THEN 'Currently executing a query'
    WHEN state = 'idle' THEN 'Waiting for next command'
    WHEN state = 'idle in transaction' THEN 'In a transaction, may hold locks'
    WHEN state IS NULL THEN 'Background worker or unknown'
    ELSE state
  END AS description
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY state
ORDER BY count(*) DESC;

SELECT
  count(*) AS total_connections,
  count(*) FILTER (WHERE state = 'active') AS active_connections,
  count(*) FILTER (WHERE wait_event IS NOT NULL) AS waiting_connections
FROM pg_stat_activity
WHERE backend_type = 'client backend';

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 13: Heap-Only Tuples (HOT) Ratio
-- ════════════════════════════════════════════════════════════════════════════
-- High HOT ratio (> 70%) means index maintenance is efficient.
-- Low HOT ratio suggests index bloat from frequent non-HOT updates.

SELECT
  relname,
  n_tup_hot_upd,
  n_tup_upd,
  CASE WHEN n_tup_upd > 0
    THEN ROUND(100.0 * n_tup_hot_upd / n_tup_upd, 1)
    ELSE NULL
  END AS hot_update_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_tup_upd DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- END OF DIAGNOSTIC SCRIPT
-- ────────────────────────────────────────────────────────────────────────────
-- Paste the output of this script back to continue the audit.
-- Alternative: psql "your-conn-string" -f scripts/diagnostics/index-audit.sql > audit-results.txt
-- ============================================================================
