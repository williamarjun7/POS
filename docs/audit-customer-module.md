# Customer Management Module — Comprehensive Audit Report
**Date:** 2026-07-25  
**Status:** Read-Only Audit — No Changes Made  
**Auditor:** Buffy AI

---

## 1. EXECUTIVE SUMMARY

The Customer Management module has undergone significant architectural evolution. The `customers` table's stored counters (`total_orders`, `total_spent`, `credit_balance`) were **dropped in migration `20260729000100_remove-dead-customer-columns.sql`**, and all metrics are now computed live from `invoices`, `payments`, and `order_batches`. This is the correct approach, but the transition is incomplete and has introduced **7 Critical, 9 High, 6 Medium, and 4 Low severity issues**.

**The most critical problems:**

1. **Customer name is the primary join key** between `order_batches`, `invoices`, and `customers`. Names are editable, case-sensitive, and can change — creating orphan records and broken links.
2. **No customer_ledger table exists.** The "ledger" is computed ad-hoc in at least 4 places with slightly different logic, making reconciliation impossible.
3. **Race conditions in customer creation** — `ensureCustomer()` does a find-or-create pattern without atomic locking. Two concurrent requests can create duplicate customer records.
4. **`customer_id` backfill is fire-and-forget.** After `process_payment` RPC creates the invoice, the customer ID is backfilled asynchronously. If the backfill fails, `customer_id` remains NULL and all customer → invoice joins fail silently.
5. **Duplicate aggregation logic** — Outstanding balance is computed in at least **6 different places** with subtle differences in filtering logic (credit method filtered differently, cancelled invoices handled differently, etc.).
6. **Cancelled/paid invoices with same total** — The `paid` field in CustomerProfile is set to `inv.total` when `inv.status === 'paid'` OR when `invPaid >= inv.total`. This conflates "fully paid" with "status says paid".
7. **No idempotency for customer ledger entries** — There is no unique constraint or deduplication mechanism for the derived ledger.

---

## 2. COMPLETE CUSTOMER DATA FLOW

### 2.1 Flow Diagram

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ POS.tsx      │────▶│ order_batches    │────▶│ invoices        │
│ (Table/Order)│     │  customer_name   │     │  customer_name  │
│              │     │  customer_id (FK)│     │  customer_id(FK)│
│              │     │  table_id        │     │  table_id       │
│              │     │  room_id         │     │  order_batch_ids│
└──────┬───────┘     └──────────────────┘     └────────┬────────┘
       │                                               │
       │  customer-name typed in POS input              │  payment_method='credit' → credit_invoice
       │  synced to order_batches.customer_name          │
       ▼                                               ▼
┌──────────────┐                            ┌──────────────────┐
│ customers    │◀─────── backfill ──────────│ payments         │
│  id (PK)     │     customer_id on          │  invoice_id (FK) │
│  name        │     invoice+order_batch     │  customer_id (FK)│
│  phone       │     via updateCustomer-     │  amount          │
│  email       │     AfterInvoice()          │  payment_method  │
│  last_visit  │                            │  reference (UQ)  │
│  notes       │                            └──────────────────┘
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ CustomerProfile   │ (computed, no DB table)
│ Ledger           │ ← invoices (debits) + real payments (credits)
│ Outstanding      │ ← computed from invoice totals - real payments
└──────────────────┘
```

### 2.2 How a Customer is Created

| Path | Trigger | Service | Table | Details |
|------|---------|---------|-------|---------|
| **Manual creation** | "Add Customer" button in Customers.tsx | `customer-service.tsx` → `createCustomerInDb()` | `customers` | INSERT into customers with name, phone, email |
| **Auto-creation via ensureCustomer()** | POS checkout | `customer-ledger.ts` → `ensureCustomer()` | `customers` | Find by name; if not found, INSERT with name only |
| **Walk-in** | POS checkout with empty name | Skipped entirely | None | Name stored as "Walk-in" on invoices/order_batches only |

### 2.3 Walk-in vs. Registered Customer

| Aspect | Walk-in | Registered |
|--------|---------|------------|
| `customers` row | None | Always has a row |
| `order_batches.customer_name` | Empty or "Walk-in" | Customer name string |
| `order_batches.customer_id` | NULL | Backfilled (may be NULL for old records) |
| `invoices.customer_name` | "Walk-in" | Customer name string |
| `invoices.customer_id` | NULL | Backfilled asynchronously |
| Can appear in Customer Profile | No (filtered by name) | Yes |
| Can have credit | No | Yes |

### 2.4 How Customer is Attached to a Table

1. Cashier types customer name in POS.tsx input field (line ~1664)
2. `setCustomerNames` updates `customerNames[selectedTableId] = name`
3. On order placement (`createOrder`), the name is written to `order_batches.customer_name`
4. On checkout, the name flows to `invoices.customer_name`

### 2.5 Customer ID Propagation (Weak — Name-Based)

**Critical finding:** The system primarily uses `customer_name` (text string) as the join key between tables. The `customer_id` foreign key is:
- Backfilled **after** invoice creation via `updateCustomerAfterInvoice()` (asynchronous, fire-and-forget)
- Can remain NULL if the backfill fails (gracefully handled—no retry)
- A name change on the `customers` table breaks all historical links

### 2.6 Tables Referencing Customer

| Table | Column | FK Constraint | Populated Reliably? |
|-------|--------|---------------|---------------------|
| `customers` | id (PK) | — | Always |
| `order_batches` | customer_name (text) | None | Always (typed by cashier) |
| `order_batches` | customer_id (FK) | FK to customers(id) ON DELETE SET NULL | **Inconsistently** |
| `invoices` | customer_name (text) | None | Always |
| `invoices` | customer_id (FK) | FK to customers(id) ON DELETE SET NULL | **Inconsistently** |
| `payments` | customer_id (FK) | FK to customers(id) ON DELETE SET NULL | Always (when set) |
| `bookings` | guest_name (text) | None | Always |
| `table_sessions` | customer_name (text) | None | Via trigger |

---

## 3. ORDER LIFECYCLE AUDIT

### 3.1 Step-by-Step Flow

| Step | Action | Table(s) | Row Created? | Row Updated? | Service | Frontend |
|------|--------|----------|-------------|-------------|---------|----------|
| 1 | Customer selected | — | No | No | POS.tsx state | Input field |
| 2 | Items added to cart | — | No (local state) | No | POS.tsx | Cart UI |
| 3 | **Order Batch Created** | `order_batches`, `order_batch_items` | **Yes** | No | POS.tsx → `db.insertOne('order_batches')` | "Send Order" button |
| 4 | More items added | `order_batch_items` | **Yes** (new items) | No | POS.tsx | Add to cart |
| 5 | **Create Another Batch** | `order_batches`, `order_batch_items` | **Yes** (new batch row) | No | POS.tsx → `createOrder()` | "Create Another Batch" |
| 6 | **Partial Payment** | `invoices`, `payments`, `order_batch_items` | **Yes** (invoice + payment) | Yes (batch items → 'paid', batch → 'partial') | `process_payment` RPC | PosPaymentDialog |
| 7 | **Split Payment** | `invoices`, `payments` | **Yes** (invoice + 1 payment per split) | Yes (batch items) | `process_payment` RPC | SplitPaymentDialog |
| 8 | **Credit Sale** | `invoices`, `payments` | **Yes** (credit_invoice, credit payment record) | Yes (batch items → 'credit') | `process_payment` RPC | PosPaymentDialog |
| 9 | Payment Received | `payments` | **Yes** | Yes (invoice status) | `process_payment` RPC | Various |
| 10 | Invoice Generated | `invoices` | **Yes** (or updated if existing invoice found) | Yes | `process_payment` RPC | RPC |
| 11 | Customer Ledger Updated | No ledger table — computed on read | No | Yes (invoice customer_id backfill) | `updateCustomerAfterInvoice()` | customer-ledger.ts |
| 12 | Dashboard Updated | — | No | No (React Query invalidation) | `cache-invalidation.ts` | DashboardPage |
| 13 | Finance Updated | — | No | No (React Query invalidation) | `cache-invalidation.ts` | Finance |

### 3.2 Invoice Creation Logic in process_payment RPC

The RPC checks for an **existing invoice** with matching `table_id` and `order_batch_ids` overlap where status is `'partial'` or `'credit_invoice'`:

```sql
SELECT id, invoice_number INTO v_existing_invoice_id, v_existing_inv_number
FROM invoices
WHERE table_id = p_table_id
  AND status IN ('partial', 'credit_invoice')
  AND order_batch_ids && p_order_batch_ids
ORDER BY created_at DESC LIMIT 1;
```

**Issue:** If found, it **updates status** on the existing invoice but does NOT add the new payment to the existing invoice's payments. The payment is still inserted for the new invoice. This means a partial invoice can accumulate payments across multiple RPC calls, which is correct behavior.

### 3.3 Create Another Batch

- **Creates a new `order_batches` row** with a new ID
- Does NOT create a new invoice
- Does NOT duplicate customer history (it's the same customer name on a different batch)
- Does NOT duplicate ledger entries (ledger is computed from invoices, not batches)
- **BUT** the `fetchCustomerStats` function in Customers.tsx counts **all** `order_batches` by customer name as `totalOrders`. Each batch == one order. Multiple batches per session = inflated order count.

---

## 4. CUSTOMER PAGE VALUE AUDIT

### 4.1 Every Displayed Value — Source Mapping

| Field | Source Table(s) | Source Column(s) | Query Location | Calculation |
|-------|----------------|-----------------|----------------|-------------|
| **Customer Name** | `customers` | `name` | Customers.tsx line 779 | Direct from row |
| **Customer Since** | `customers` | `created_at` | Customers.tsx (via CustomerProfile) | Direct from row (displayed as "Customer since") |
| **Last Visit** | `customers` | `last_visit` | CustomerProfile.tsx line 1309 | Direct from customer object |
| **Total Orders** | `order_batches` | `customer_name` (ALL batches) | **Customers.tsx** line 723: `.from('order_batches').select('customer_name').in('customer_name', customerNames)` | COUNT(order_batches) per customer name |
| **Total Orders** | `order_batches` | `customer_name` | **CustomerProfile.tsx** line 1314: `orders.length` | COUNT(order_batches) — same as page |
| **Total Spent** | `invoices` | `customer_id`, `total` | **Customers.tsx** line 711: `.from('invoices').select('customer_id, total').in('customer_id', customerIds)` | SUM(invoice.total) — **NO cancellation filter** |
| **Total Spent** | `invoices` | `customer_name`, `total` | **CustomerProfile.tsx** line 1315-1317: filter `inv.status !== 'cancelled'` then reduce | SUM(invoice.total) — **WITH cancellation filter** |
| **Outstanding Credit** | `invoices` + `payments` | `invoice.total`, `payment.amount` (non-credit) | **CustomerProfile.tsx** lines 1328-1332 | SUM(invoice.total - real_payments) for unpaid invoices |
| **Outstanding Credit** | `invoices` + `payments` | `invoice.total`, `payment.amount` | **Customers.tsx** fetchOutstandingStats() lines 795-836 | Same — uses invoices + payments |
| **Avg Order Value** | Computed | — | **CustomerProfile.tsx** line 1333 | `totalSpent / totalOrders` (when orders > 0) |
| **Loyalty Points** | Hardcoded | — | `customer-service.tsx` line 69, Customers.tsx line 778 | **Always 0** — not implemented |
| **Orders Count** | `order_batches` | `customer_name` | CustomerProfile.tsx `useCustomerProfileData` | `orders.length` |
| **Invoices Count** | `invoices` | `customer_name` | CustomerProfile.tsx `useCustomerProfileData` | `invoices.length` |
| **Payments Count** | `payments` | `customer_id` OR `invoice_id` | CustomerProfile.tsx line 408-419 | OR filter: customer_id or invoice_id in customer's invoices |
| **Ledger Count** | Computed | — | CustomerProfile.tsx lines 552-583 | Combined invoice debits + payment credits, sorted chronologically |
| **Recent Activity** | orders + invoices + payments | — | CustomerProfile.tsx `recentActivity` memo (lines 544-563) | Merged arrays from orders, invoices, payments, sorted by date |
| **Recent Orders** | `order_batches` (with joins) | `order_batch_items`, `restaurant_tables` | CustomerProfile.tsx lines 379-405 | orders.slice(0, 5) |
| **Most Ordered Items** | `order_batch_items` | `name`, `quantity`, `unit_price` | CustomerProfile.tsx lines 569-582 | Aggregated from all orders by item name |
| **Payment Breakdown** | `payments` (filtered non-credit) | `payment_method`, `amount` | CustomerProfile.tsx lines 584-603 | Grouped by method, summed amounts |
| **Outstanding Invoice Count** | `invoices` | `status` | CustomerProfile.tsx line 767 | invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').length |

### 4.2 **CRITICAL INCONSISTENCY**: Total Spent

| Location | Includes Cancelled Invoices? | File | Line |
|----------|----------------------------|------|------|
| **Customers.tsx** (table stats) | **YES** — no status filter | Customers.tsx | 711-714 |
| **CustomerProfile.tsx** (KPI) | **NO** — filters out cancelled | CustomerProfile.tsx | 1315-1317 |
| **Dashboard** | **NO** — filters out cancelled | dashboard.service.ts | 161-164 |
| **Finance** | **NO** — filters out cancelled | finance-aggregation.ts | ~50 |

The Customers.tsx table stats **do not filter out cancelled invoices**, so the "Total Spent" column on the customer table will be inflated by any cancelled invoice amounts.

### 4.3 **CRITICAL INCONSISTENCY**: Order Count

| Location | Counting | File |
|----------|----------|------|
| **Customers.tsx** (table) | COUNT of ALL `order_batches` by customer name | line 723 |
| **CustomerProfile.tsx** (KPI) | `orders.length` (all fetched batches, limit 200) | line 1314 |
| **Definition comment** | "one POS session = one order" | Customers.tsx line 687 |

**Reality:** A single POS session can create MULTIPLE order_batches ("Create Another Batch"). Each batch is counted as a separate order, inflating the order count.

---

## 5. CUSTOMER LEDGER AUDIT

### 5.1 No Customer Ledger Table Exists

**Critical finding:** There is **no `customer_ledger` table** in the database. The `customer-ledger.ts` service builds the ledger dynamically in memory by:
1. Fetching all invoices for a customer → debits
2. Fetching all payments (non-credit) for a customer → credits
3. Sorting chronologically
4. Computing running balance

### 5.2 Where the Ledger is Reconstructed

| Location | File | Function |
|----------|------|----------|
| **customer-ledger.ts** | `getCustomerLedger()` | Used by React Query hook |
| **customer-ledger.ts** | `getAllLedgers()` | Admin overview |
| **CustomerProfile.tsx** | `useCustomerProfileData()` | Inline ledger construction (lines 552-583) |
| **CustomerProfile.tsx** | LedgerTab display | Line ~1050+ |

### 5.3 Ledger Entry Origins

| Event | Debit? | Credit? | Table Inserted | Triggered By |
|-------|--------|---------|----------------|--------------|
| Invoice created | Invoice total | — | `invoices` | `process_payment` RPC |
| Payment received (cash/FonePay/QR) | — | Payment amount | `payments` | `process_payment` RPC or ReceivePaymentModal |
| Credit sale | Invoice total | — | `invoices` (status='credit_invoice') | `process_payment` RPC |
| Credit payment row in `payments` | — | **IGNORED** | `payments` (method='credit') | `process_payment` RPC (filtered out everywhere) |
| Invoice void | No ledger entry | No ledger entry | No action | No void handling in ledger |

### 5.4 **ISSUE**: Balance Calculation Mismatch

The CustomerProfile.tsx builds its own ledger with a different balance calculation than `getCustomerLedger()`:

**CustomerProfile.tsx** (lines 552-583):
- Includes ALL invoices as debits (including `credit_invoice` status)
- Excludes credit-method payments
- Running balance = debits - credits

**getCustomerLedger()** (customer-ledger.ts lines 183-226):
- Excludes cancelled invoices from balance
- Excludes credit-method payments from balance
- Running balance = invoice totals - real payments

**Difference:** CustomerProfile does NOT exclude cancelled invoices from the balance (though it does in the KPI). The `getCustomerLedger` balance calculation at line 207 explicitly skips cancelled invoices.

---

## 6. GHOST DATA SOURCES

### 6.1 Identified Sources

| # | Source | Type | Severity | Status |
|---|--------|------|----------|--------|
| 1 | **Duplicate invoices** | Actual DB dups | **Critical** | Migration `20260727000100` was created to fix this, indicating duplicates existed |
| 2 | **Deduplication migration skipped** | Code logic | **High** | The migration checks if `customers.total_orders` column exists — if dropped, it SKIPS. The column was dropped in a *later* migration (20260729000100), so the dedup migration should have run. But the column drop was in `20260729000100` and dedup was in `20260727000100` — order implies dedup ran before column drop. Safe. |
| 3 | **Multiple batches per session** | Data design | **Medium** | "Create Another Batch" creates new order_batches rows. `totalOrders = COUNT(order_batches)` inflates order count per POS session. |
| 4 | **Cancelled invoices in Total Spent** | Aggregation bug | **High** | Customers.tsx `fetchCustomerStats()` does NOT filter cancelled invoices |
| 5 | **Credit payment records** | Data design | **Medium** | `payments` table contains rows with `payment_method='credit'` that represent debt, not money. Filtered inconsistently across the app. |
| 6 | **Duplicate customer records (same name)** | Race condition | **High** | `ensureCustomer()` in customer-ledger.ts does find-or-create without unique constraint on name |
| 7 | **Superseded invoices** | Data design | **Medium** | When `process_payment` RPC finds an existing `partial`/`credit_invoice` invoice for the same table/batch, it updates its status but creates a NEW payment record — the old invoice is not "closed" properly |
| 8 | **Double-counting in legacy code** | Bug (fixed) | **Low** | The git diff shows CustomerProfile.tsx previously counted BOTH payment records AND paid invoice amounts in PaymentBreakdown. This was fixed in the current HEAD. |
| 9 | **Activity log duplicates** | Data design | **Low** | Multiple operations can log similar activities for the same event (payment → activity log + dashboard updates) |
| 10 | **invoice_items insert failure silently caught** | Error handling | **Medium** | `RoomCheckoutDialog.tsx` line 236: `.catch(() => {})` — invoice items insertion failure is silently swallowed |

### 6.2 Duplicate Payments

The `payments.reference` column has a **UNIQUE constraint** (`payments_reference_unique`), and the `process_payment` RPC checks for duplicate references:

```sql
IF p_payment_reference IS NOT NULL AND p_payment_reference != '' THEN
  SELECT id, invoice_id INTO v_existing_payment_id, v_existing_invoice_id
  FROM payments WHERE reference = p_payment_reference;
  IF v_existing_payment_id IS NOT NULL THEN ...
    RETURN jsonb_build_object('success', true, 'is_duplicate', true, ...);
  END IF;
END IF;
```

**However:** The idempotency guard is reference-based. If no reference is provided (or if it's empty string), the guard is bypassed entirely.

---

## 7. DATABASE RELATIONSHIP MAP

### 7.1 Entity Relationship (Logical)

```
customers (id) ──┐
                 ├──< order_batches (customer_id FK, nullable, ON DELETE SET NULL)
                 ├──< invoices (customer_id FK, nullable, ON DELETE SET NULL)
                 ├──< payments (customer_id FK, nullable, ON DELETE SET NULL)
                 
order_batches (id) ──< order_batch_items (batch_id FK, ON DELETE CASCADE)
order_batches (table_id) ──> restaurant_tables (id FK)
order_batches (room_id) ──> rooms (id FK)

invoices (id) ──< invoice_items (invoice_id FK)
invoices (id) ──< payments (invoice_id FK, nullable)
invoices (table_id) ──> restaurant_tables (id FK, nullable)
invoices (booking_id) ──> bookings (id FK, nullable)

bookings (room_id) ──> rooms (id FK)
```

### 7.2 Foreign Key Details

| FK | From | To | ON DELETE | Includes in index? |
|----|------|----|-----------|-------------------|
| FK: order_batches → customers | `order_batches.customer_id` | `customers.id` | SET NULL | `idx_order_batches_customer` exists |
| FK: invoices → customers | `invoices.customer_id` | `customers.id` | SET NULL | No dedicated index |
| FK: payments → customers | `payments.customer_id` | `customers.id` | SET NULL | No dedicated index |
| FK: invoices → tables | `invoices.table_id` | `restaurant_tables.id` | SET NULL | No dedicated index |
| FK: payments → invoices | `payments.invoice_id` | `invoices.id` | SET NULL | No dedicated index |
| FK: order_batch_items → order_batches | `order_batch_items.batch_id` | `order_batches.id` | CASCADE | No dedicated index |

---

## 8. CODE DUPLICATION — INCONSISTENT CALCULATIONS

### 8.1 Outstanding Balance is Computed in 6+ Places

| # | Location | File | Line(s) | Filter Logic |
|---|----------|------|---------|-------------|
| 1 | Customer table stats | Customers.tsx | 795-836 | `invoices.not('status', 'in', '(paid,cancelled)')` |
| 2 | ReceivePaymentModal | Customers.tsx | 251-290 | `invoice.status !== 'paid' && invoice.status !== 'cancelled'` |
| 3 | CustomerProfile KPI | CustomerProfile.tsx | 1328-1332 | `i.status !== 'paid' && i.status !== 'cancelled'` |
| 4 | CustomerProfile Ledger | CustomerProfile.tsx | 552-583 | All invoices (no filter for ledger entries) |
| 5 | getCustomerBalance | customer-ledger.ts | 175-197 | `inv.status !== 'paid' && inv.status !== 'cancelled'` (backend) |
| 6 | getCustomerLedger | customer-ledger.ts | 207-215 | `inv.status !== 'cancelled'` & `payment !== 'credit'` (different!) |
| 7 | Dashboard service | dashboard.service.ts | 177-208 | `.not('status', 'in', '(paid,refunded,cancelled)')` |
| 8 | Finance aggregation | finance-aggregation.ts | 169-229 | `.filter(i.status !== 'paid' && i.status !== 'cancelled')` |
| 9 | Dashboard pending invoices | DashboardPage.tsx | ~70-120 | `.not('status', 'in', '(paid,refunded,cancelled)')` + PostgREST join aggregation |

### 8.2 Credit-Filtering Logic Duplicated

The pattern `p.payment_method !== 'credit'` appears in **at least 12 locations** across the codebase:
- `dashboard.service.ts` lines 117, 186, 209, 249
- `finance-aggregation.ts` lines 94, 188, 287, 381, 406
- `customer-ledger.ts` line 193
- `CustomerProfile.tsx` line 558
- `Customers.tsx` line 255
- `DashboardPage.tsx`

### 8.3 Invoice-to-Customer Linking Logic Duplicated

The pattern of fetching invoices by `customer_id` then fetching payments by `invoice_id` to compute outstanding balance is implemented independently in:
- `customer-ledger.ts` (`getCustomerBalance`)
- `customer-ledger.ts` (`getCustomerLedger`)
- `Customers.tsx` (`fetchOutstandingStats`)
- `Customers.tsx` (`ReceivePaymentModal` invoice fetching)
- `CustomerProfile.tsx` (`useCustomerProfileData`)

---

## 9. RACE CONDITIONS

| # | Description | Location | Severity |
|---|-------------|----------|----------|
| 1 | **Duplicate customer creation** — `ensureCustomer()` does find-or-create with no transaction lock. Two concurrent checkouts with the same customer name create two customer rows. | `customer-ledger.ts` line 52-64 | **High** |
| 2 | **Customer ID backfill after payment** — `updateCustomerAfterInvoice()` runs AFTER the RPC commits. If it fails, `customer_id` remains NULL and all joins fail. | POS.tsx line 1056-1078 | **High** |
| 3 | **Concurrent batch payment** — `process_payment` RPC checks `status NOT IN ('paid','cancelled','voided')` when updating batch items. The `GET DIAGNOSTICS` check ensures only the first transaction wins. | `deploy_rpc.sql` line 162-165, `process-payment-rpc.sql` | **Low** (handled) |
| 4 | **Multiple ReceivePaymentModal submissions** — The `isSubmitting` flag prevents double-click, but there's no backend idempotency for the Customer page payment flow (only for POS `process_payment` RPC). | Customers.tsx `handleReceivePayment` | **High** |
| 5 | **30-second background refresh race** — `fetchCustomerStats` and `fetchOutstandingStats` in Customers.tsx run on 30s intervals. If the user opens the page and immediately views a customer, the stats may not reflect the latest data. | Customers.tsx lines 741-750, 862-870 | **Low** |

---

## 10. FRONTEND/BACKEND MISMATCHES

| # | Issue | Frontend Expects | Backend Provides | File |
|---|-------|-------------------|-----------------|------|
| 1 | **Customer type includes `creditBalance`** | The `Customer` interface has `creditBalance: number` | Column was dropped from DB (always 0) | `customer-service.tsx` line 38 |
| 2 | **Customer type includes `loyaltyPoints`** | The `Customer` interface has `loyaltyPoints: number` | Never implemented (always 0) | `customer-service.tsx` line 37 |
| 3 | **Customer type includes `totalOrders`** | The `Customer` interface has `totalOrders: number` | Column was dropped from DB (always 0 from mapper) | `customer-service.tsx` line 35 |
| 4 | **Customer type includes `totalSpent`** | The `Customer` interface has `totalSpent: number` | Column was dropped from DB (always 0 from mapper) | `customer-service.tsx` line 36 |
| 5 | **InvoiceRow still has `tax` field** | The `InvoiceRow` interface has `tax: number` | Migration `20260804000100` removed tax columns | `db/types.ts` line 180 |
| 6 | **CustomerRow has no `total_orders`/`total_spent`/`credit_balance`** | These are correctly absent from the row type | Correct — matches DB | `db/types.ts` lines 117-127 |
| 7 | **CustomerFormModal passes `totalOrders`, `totalSpent`, `creditBalance`, `loyaltyPoints`** | Form submits these fields | Backend ignores them (dead columns) | Customers.tsx lines 141-148 |

---

## 11. MISSING CUSTOMER_LEDGER TABLE — ROOT CAUSE ANALYSIS

### 11.1 Why There Is No customer_ledger Table

The original design (complete-schema.sql) never included a `customer_ledger` table. All ledger functionality was implemented as:
1. **In-memory calculations** in the frontend (CustomerProfile.tsx)
2. **Service-level computations** in `customer-ledger.ts`

### 11.2 Problems Caused

1. **No audit trail** — If an invoice is deleted or a payment is removed, the historical ledger changes retroactively
2. **N+1 queries** — Every ledger view requires fetching invoices + payments, then computing in JS
3. **Inconsistent balances** — Different implementations produce different results
4. **No offline capability** — The ledger is never materialized

### 11.3 Recommendation

A `customer_ledger` table should be created with:
- `customer_id` (FK to customers)
- `entry_date` (TIMESTAMPTZ)
- `entry_type` (invoice_created, payment_received, credit_sale, etc.)
- `reference_id` (generic UUID pointing to the source record)
- `debit` (DECIMAL)
- `credit` (DECIMAL)
- `running_balance` (DECIMAL)
- `description` (TEXT)

Entries should be created by database triggers on `invoices` and `payments` tables, ensuring atomicity.

---

## 12. EDGE CASE ANALYSIS

| Edge Case | Current Behavior | Issue |
|-----------|-----------------|-------|
| **Walk-in customer** | No `customers` row; name is "Walk-in" on `invoices`/`order_batches`; skipped by `updateCustomerAfterInvoice()` | Correct — intentional |
| **Registered customer with no orders** | Exists in `customers` table with `last_visit = NULL` | Will show "Customer since" as current date (fallback in mapper) |
| **Customer name change** | Breaks all historical links (name-based joins) | **Critical** — no migration path |
| **Multiple tables, same customer** | Works — customer name is per-table via `customerNames[tableId]` | Correct |
| **Room service customer** | Customer name set on `order_batches` with `room_id` instead of `table_id` | Correct |
| **Merged tables** | Not handled by customer logic — separate tables have separate customer names | **Medium** — no merge transaction concept |
| **Create Another Batch** | New `order_batches` row; counted as separate order | Inflates order count |
| **Partial payment then full payment** | First call creates invoice with status='partial' and payment record. Second call finds existing invoice, updates status to 'paid', creates another payment | Correct — but old invoice's total doesn't update |
| **Split payment** | One invoice, multiple payment records (one per method) | Correct |
| **Credit sale** | Invoice created with status='credit_invoice'; `payments` row with method='credit'; filtered out of real-money calculations everywhere | Correct but confusing (credit stored in payments table) |
| **Multiple payments against one invoice** | Supported — invoice status updated to 'paid' when payments cover the total | Correct |
| **Invoice void/cancel** | Status set to 'cancelled' — filtered out of most calculations | Correct when filtered, bug when not (see Customers.tsx stats) |
| **Refunds** | No refund mechanism in customer module | **High** — no way to reduce customer's Total Spent |
| **Invoice amount edits** | No edit mechanism — invoice total is fixed | **Medium** — corrections require void + re-create |
| **Customer reassignment** | No feature to change customer on an existing invoice/order | **Medium** — would require updating customer_name on invoice + order_batches |
| **Table reassignment** | No feature — batches stay with original table | **Low** |

---

## 13. ISSUE SUMMARY BY SEVERITY

### CRITICAL (7)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| C1 | **Customer name as primary join key** | POS.tsx, Customers.tsx, CustomerProfile.tsx, customer-ledger.ts, all services | Name changes break all historical links. No referential integrity. |
| C2 | **No customer_ledger table** | Entire module | Every ledger view is ad-hoc computed. No audit trail. Race conditions on read. |
| C3 | **Credit payment records in payments table** | `payments` table, `process_payment` RPC | Credit is stored as a payment method, requiring every query to filter `payment_method !== 'credit'`. 12+ filter locations — inevitable drift. |
| C4 | **Cancelled invoices counted in Total Spent** | Customers.tsx `fetchCustomerStats()` line 711-714 | The customer table "Total Spent" column is inflated by cancelled invoice amounts. |
| C5 | **customer_id backfill is fire-and-forget** | POS.tsx line 1056-1078, customer-ledger.ts `updateCustomerAfterInvoice()` | If backfill fails, `customer_id` remains NULL and all FK joins fail silently. |
| C6 | **Duplicate customer records (same name)** | customer-ledger.ts `ensureCustomer()` line 52-64 | No unique constraint on `customers.name`. Race condition creates duplicates. |
| C7 | **No idempotency for ReceivePaymentModal** | Customers.tsx `handleReceivePayment()` line 905+ | The "Receive Payment" flow on the Customer page has no idempotency check (unlike POS which uses `process_payment` RPC with reference-based dedup). |

### HIGH (9)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| H1 | **Total Orders inflates with multiple batches** | Customers.tsx line 723, CustomerProfile.tsx line 1314 | Each "Create Another Batch" action adds a new order to the count. |
| H2 | **CustomerProfile and getCustomerLedger balance differ** | CustomerProfile.tsx line 552 vs customer-ledger.ts line 207 | CustomerProfile ledger includes cancelled invoices in balance; getCustomerLedger excludes them. |
| H3 | **30s stale data on customer page** | Customers.tsx background interval refresh | Stats are up to 30s stale. Table and profile may disagree. |
| H4 | **InvoiceItems insert failure silently swallowed** | RoomCheckoutDialog.tsx line 236 | `.catch(() => {})` — invoice items not created but no error shown. |
| H5 | **Each query re-fetches ALL invoices for the customer** | CustomerProfile.tsx, customer-ledger.ts | No pagination on invoice/payment fetches (limit 200, but no server-side cursor). |
| H6 | **All-time queries get slower** | finance-aggregation.ts, dashboard.service.ts | Outstanding balance queries fetch ALL invoices, then ALL payments for those invoices. No date bounds on outstanding computation. |
| H7 | **Payment method breakdown in Finance includes unknown methods** | finance-aggregation.ts `fetchPaymentMethodBreakdown()` | Unknown methods (like 'split', 'partial') are grouped as "Other" but aren't clearly labeled. |
| H8 | **Dashboard pending invoices join flattens rows** | DashboardPage.tsx pending payment query | PostgREST `!left` join on payments creates duplicate rows for multi-payment invoices; must aggregate. |
| H9 | **30s background refresh may retrigger during user typing** | Customers.tsx useEffect cleanup | Interval is not paused when user is actively filtering/searching. |

### MEDIUM (6)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| M1 | **Dead columns in Customer type** | customer-service.tsx lines 35-38 | `creditBalance`, `loyaltyPoints`, `totalOrders`, `totalSpent` are always 0 from mapper but still in the interface |
| M2 | **InvoiceRow has dead `tax` field** | db/types.ts line 180 | `tax: number` — column was removed by migration |
| M3 | **Activity log duplication** | Customers.tsx, POS.tsx, process-payment.ts | Both the frontend and the payment flow log similar activities. Events may be logged twice. |
| M4 | **No refund mechanism** | Entire customer module | A refund would require voiding an invoice + creating a negative payment. No feature exists. |
| M5 | **No invoice edit mechanism** | invoices table | Invoice total is fixed after creation. Corrections require void + recreate. |
| M6 | **CustomerFormModal sends dead fields to DB** | Customers.tsx `handleSave()` lines 895-903 | `totalOrders`, `totalSpent`, `loyaltyPoints`, `creditBalance` are sent in the payload but ignored by the backend. |

### LOW (4)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| L1 | **CustomerProfile ledger shows reversed entries** | CustomerProfile.tsx line 582 | Ledger entries are sorted chronologically, then reversed for display. The running balance is computed before reversal, which is correct but fragile. |
| L2 | **Loyalty Points always 0** | Types, services | `loyaltyPoints` field exists everywhere but is never populated or calculated |
| L3 | **Customer "since" = last_visit, not created_at** | CustomerProfile.tsx line 442 | "Customer since" displays `formatDate(customer.lastVisit)` which is the last visit, not the creation date |
| L4 | **Customer phone/email shown even when empty** | CustomerProfile.tsx line 425-433 | Conditional rendering works — only shown when populated |

---

## 14. FILES RESPONSIBLE FOR EACH ISSUE

| Issue ID | Primary File(s) | Function/Line | Service/Hook |
|----------|----------------|---------------|--------------|
| C1 | `src/pages/POS.tsx`, `src/components/customers/CustomerProfile.tsx`, `src/lib/services/customer-ledger.ts` | Multiple | All customer services |
| C2 | Never created — missing migration | N/A | N/A |
| C3 | `src/lib/services/process-payment-rpc.ts` → deploy_rpc.sql | `process_payment` RPC | RPC stores credit as payment |
| C4 | `src/pages/Customers.tsx` | `fetchCustomerStats()` line 711-714 | `useCustomers` hook |
| C5 | `src/pages/POS.tsx` → `handlePaymentComplete()` | line 1056-1078, then `customer-ledger.ts` `updateCustomerAfterInvoice()` | `customer-ledger.ts` |
| C6 | `src/lib/services/customer-ledger.ts` | `ensureCustomer()` line 52-64 | All customer services |
| C7 | `src/pages/Customers.tsx` | `handleReceivePayment()` line 905+ | `customer-service.tsx` |
| H1 | `src/pages/Customers.tsx`, `src/pages/POS.tsx` | fetchCustomerStats line 723, createOrder line 1186 | Both |
| H2 | `src/components/customers/CustomerProfile.tsx` vs `src/lib/services/customer-ledger.ts` | CustomerProfile line 552, customer-ledger line 207 | Both |
| H3 | `src/pages/Customers.tsx` | `useEffect` lines 741-750, 862-870 | `useCustomers()` |
| H4 | `src/components/operations/RoomCheckoutDialog.tsx` | line 236 | Room checkout flow |
| H5 | `src/components/customers/CustomerProfile.tsx` | `useCustomerProfileData()` lines 379-419 | Internal hook |
| H6 | `src/lib/services/finance-aggregation.ts`, `src/lib/services/dashboard.service.ts` | fetchFinancialSummary(), getDashboardReport() | Both aggregation services |
| H7 | `src/lib/services/finance-aggregation.ts` | `fetchPaymentMethodBreakdown()` line 386 | Finance service |
| H8 | `src/pages/dashboard/DashboardPage.tsx` | Pending payments query lines ~70-120 | Dashboard |
| H9 | `src/pages/Customers.tsx` | `useEffect` cleanup | Customers list |
| M1 | `src/lib/services/customer-service.tsx` | `Customer` interface lines 30-43 | Customer service |
| M2 | `src/lib/db/types.ts` | `InvoiceRow` line 180 | DB types |
| M3 | Multiple | `logActivitySafe()` calls | Multiple services |
| M4 | Not implemented | N/A | All customer services |
| M5 | Not implemented | N/A | All |
| M6 | `src/pages/Customers.tsx` | `CustomerFormModal` lines 141-148 | Customer form |
| L1 | `src/components/customers/CustomerProfile.tsx` | Ledger building lines 552-583 | Internal hook |
| L2 | `src/lib/services/customer-service.tsx`, `src/types/index.ts` | Interface definitions | Customer service |
| L3 | `src/components/customers/CustomerProfile.tsx` | `ProfileHeader` line 442 | Profile header |
| L4 | `src/components/customers/CustomerProfile.tsx` | `ProfileHeader` lines 425-433 | Profile header |

---

## 15. AUDIT METHODOLOGY

- **Read-only file analysis** of all customer-related source files
- **Database schema review** via migration files and type definitions
- **Cross-referencing** statistics calculations across pages, services, and hooks
- **Trace-based analysis** following customer data from creation through every transformation
- **Code duplication detection** by searching for replicated business logic patterns
- **No execution or mutation** of any code or database was performed

---

*End of Audit Report — No code or data was modified during this analysis.*
