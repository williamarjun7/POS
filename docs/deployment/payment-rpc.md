# Payment RPC — Deployment Runbook

## Overview

Deploying the `process_payment` RPC replaces 4+ client-side database calls with a single PostgreSQL function. This runbook covers migration, verification, rollback, and monitoring.

## Prerequisites

- [ ] Database admin access (superuser or migrations role)
- [ ] Application deploy access
- [ ] Monitoring dashboard access
- [ ] Rollback SQL prepared
- [ ] Smoke test script prepared

## Migration Order

```
1. SCHEDULE maintenance window (low-traffic period)
2. RUN database migration
3. SMOKE TEST RPC
4. DEPLOY frontend code
5. SMOKE TEST payment flow
6. VERIFY monitoring
7. EXIT maintenance window
```

---

## Step 1: Schedule Maintenance Window

**Duration**: 15 minutes (migration + smoke test)
**Recommended**: 2:00 AM – 4:00 AM local time

### Pre-migration checklist:

- [ ] Confirm no active payments in progress
- [ ] Check recent payment error rate (< 1%)
- [ ] Verify database connection pool has free connections
- [ ] Back up the `payments` and `invoices` tables:

```sql
CREATE TABLE payments_backup_pre_rpc AS SELECT * FROM payments;
CREATE TABLE invoices_backup_pre_rpc AS SELECT * FROM invoices;
```

---

## Step 2: Run Database Migration

### Migration file: `migrations/20260801000100_process-payment-rpc.sql`

### Commands:

```bash
# Apply migration
psql "$DATABASE_URL" -f migrations/20260801000100_process-payment-rpc.sql
```

### Migration components:

| Component | Type | Idempotent? |
|-----------|------|-------------|
| `payments_reference_unique` | UNIQUE constraint | ✅ Yes (`IF NOT EXISTS`) |
| `invoice_number_seq` backfill | Sequence SETVAL | ✅ Yes (forward-only) |
| `process_payment()` | PostgreSQL function | ✅ Yes (`CREATE OR REPLACE`) |

### Verify migration:

```sql
-- 1. Check constraint exists
SELECT conname FROM pg_constraint WHERE conname = 'payments_reference_unique';

-- 2. Check function exists
SELECT proname FROM pg_proc WHERE proname = 'process_payment';

-- 3. Check function signature
SELECT proname, pronargs, proargtypes
FROM pg_proc WHERE proname = 'process_payment';
```

---

## Step 3: Smoke Test RPC

### Run these smoke tests directly against the database:

```sql
-- Test 1: Authorization failure (wrong user_id)
SELECT process_payment(
  '00000000-0000-0000-0000-000000000000', 'Test', 100, 0, 0, 100,
  'paid', 'cash', 100, 'smoke-test-auth-' || gen_random_uuid()::text, NULL,
  '00000000-0000-0000-0000-000000000000',  -- fake user_id ≠ auth.uid()
  '{}', 'paid', '{}', '{}'
);
-- Expected: { "code": "UNAUTHORIZED", "success": false }

-- Test 2: Validation failure (amount > total)
SELECT process_payment(
  '00000000-0000-0000-0000-000000000000', 'Test', 100, 0, 0, 100,
  'paid', 'cash', 999, 'smoke-test-validation-' || gen_random_uuid()::text, NULL,
  NULL,
  ARRAY[]::uuid[], 'paid', ARRAY[]::uuid[], ARRAY[]::uuid[]
);
-- Expected: { "code": "VALIDATION_ERROR", "success": false }

-- Test 3: Invalid payment method
SELECT process_payment(
  '00000000-0000-0000-0000-000000000000', 'Test', 100, 0, 0, 100,
  'paid', 'bitcoin', 100, 'smoke-test-method-' || gen_random_uuid()::text, NULL,
  NULL,
  ARRAY[]::uuid[], 'paid', ARRAY[]::uuid[], ARRAY[]::uuid[]
);
-- Expected: { "code": "INVALID_PAYMENT_METHOD", "success": false }
```

### Expected: All three smoke tests return `{ "success": false }` with appropriate error codes.

---

## Step 4: Deploy Frontend Code

### Deployment steps:

```bash
# Build the application
npm run build

# Deploy static assets
npm run deploy

# OR: Deploy via InsForge CLI
npx insforge deploy
```

### Files changed (verify deployment):

| File | Change type |
|------|-------------|
| `src/pages/POS.tsx` | Modified — PII fix, dead code removed, retry logic |
| `src/lib/services/process-payment-rpc.ts` | Modified — typed error codes |
| `src/lib/services/payment-monitoring.ts` | **New** — monitoring service |

---

## Step 5: Smoke Test Payment Flow

### Production smoke test:

1. **Open POS** → Select a test table
2. **Add items** → Add 2-3 menu items to cart
3. **Place order** → Verify batch is created
4. **Complete payment** → Pay via Cash
5. **Verify**:
   - [ ] Invoice appears in billing page
   - [ ] Payment record exists in payments table
   - [ ] Batch items status = 'paid'
   - [ ] Batch status = 'paid'
   - [ ] Table status = 'available' (session closed)
   - [ ] Invoice items inserted (check invoice_items table)
   - [ ] Activity log entry created

### Repeat for:
- [ ] Fonepay QR payment
- [ ] Credit account payment
- [ ] Partial payment
- [ ] Split payment

---

## Step 6: Verify Monitoring

- [ ] Check application logs for payment_monitor.* events
- [ ] Check activity_logs table for payment events
- [ ] Verify no error rate increase

---

## Step 7: Exit Maintenance Window

- [ ] Enable full traffic
- [ ] Monitor for 15 minutes
- [ ] Confirm no regressions

---

## Rollback Procedure

### Rollback SQL:

```sql
-- 1. Drop the RPC function
DROP FUNCTION IF EXISTS public.process_payment;

-- 2. Remove the UNIQUE constraint
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_reference_unique;

-- 3. Restore backup tables (if needed)
-- TRUNCATE payments;
-- INSERT INTO payments SELECT * FROM payments_backup_pre_rpc;
```

### Rollback frontend code:

```bash
git revert HEAD --no-edit
git push origin main
```

### Verify rollback:

```sql
SELECT proname FROM pg_proc WHERE proname = 'process_payment';
-- Expected: 0 rows
```

---

## Failure Recovery

| Failure | Recovery |
|---------|----------|
| Migration fails | Roll back immediately. Check error logs. Fix migration issue. Retry. |
| Smoke test fails | Do not deploy frontend. Roll back migration. Investigate. |
| Frontend deploy fails | Keep old frontend running. Migration is backward-compatible. |
| Post-deploy payment fails | Check RPC error code. If UNAUTHORIZED: check user roles. If VALIDATION_ERROR: check client input. If CONCURRENCY_CONFLICT: expected behavior. |
| Deferred ops fail | Check activity_logs for failure events. Retry manually via admin panel or DB console. |

---

## Verification Checklist

### After deployment, verify all of the following:

- [ ] Payment creates invoice with correct number
- [ ] Payment creates payment record
- [ ] Payment creates batch items with paid status
- [ ] Payment updates batch status
- [ ] Table session closes automatically
- [ ] Second payment for same batch is rejected (CONCURRENCY_CONFLICT)
- [ ] Duplicate payment reference returns is_duplicate=true
- [ ] Invalid user_id returns UNAUTHORIZED
- [ ] Invalid payment method returns INVALID_PAYMENT_METHOD
- [ ] Payment amount > invoice total returns VALIDATION_ERROR
- [ ] Empty batch IDs returns VALIDATION_ERROR
- [ ] Deferred operations (invoice_items, inventory, customer) complete within 3 retries
- [ ] Monitoring events appear in activity_logs

---

## Monitoring Setup

### Key metrics to monitor:

```sql
-- Payment success rate
SELECT
  COUNT(*) FILTER (WHERE a.details LIKE '%payment_success%') AS successes,
  COUNT(*) FILTER (WHERE a.details LIKE '%payment_failed%') AS failures,
  COUNT(*) AS total
FROM activity_logs a
WHERE a.created_at > NOW() - INTERVAL '1 hour'
  AND a.activity_type LIKE 'payment_%';

-- Error code distribution
SELECT
  a.details::json->>'errorCode' AS error_code,
  COUNT(*) AS count
FROM activity_logs a
WHERE a.created_at > NOW() - INTERVAL '1 hour'
  AND a.activity_type LIKE 'payment_%failed%'
GROUP BY error_code
ORDER BY count DESC;
```

### Alert thresholds:

| Alert | Threshold | Action |
|-------|-----------|--------|
| Payment failure rate > 5% | Last 5 minutes | Page engineer |
| Concurrency conflicts > 10/min | Last 5 minutes | Investigate table contention |
| Authorization failures > 3/min | Last 5 minutes | Investigate potential attack |
| RPC errors > 1% | Last 5 minutes | Check database connectivity |
