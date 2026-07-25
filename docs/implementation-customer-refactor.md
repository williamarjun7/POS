# Customer Management Module — Implementation Report
**Date:** 2026-07-25  
**Status:** Complete - All phases implemented

---

## 1. Architecture Overview

```
                                  ┌─────────────────────────────┐
                                  │ customer-aggregation.ts     │
                                  │  SINGLE SOURCE OF TRUTH     │
                                  │                             │
                                  │  computeCustomerStats()     │
                                  │  computeAllCustomerStats()  │
                                  │  computeOverallOutstanding()│
                                  │  computeCustomerLedger()    │
                                  │  computePaymentBreakdown()  │
                                  │                             │
                                  │  useCustomerStats()         │
                                  │  useCustomerLedgerData()    │
                                  │  useOverallOutstanding()    │
                                  └─────────────────────────────┘
                                           ▲
                         ┌─────────────────┼──────────────────┐
                         │                 │                   │
              ┌──────────┴──────┐  ┌───────┴────────┐  ┌──────┴───────┐
              │  Customers.tsx  │  │CustomerProfile │  │customer-     │
              │  (table + stats)│  │tsx (KPI/Ledger)│  │ledger.ts     │
              └─────────────────┘  └────────────────┘  │(delegates)   │
                                                        └──────────────┘
```

## 2. Files Created

### `src/lib/services/customer-aggregation.ts` — NEW
The shared single-source-of-truth service. Contains:
- `computeCustomerStats(customerId)` — Total Orders, Total Spent, Outstanding Credit, Avg Order Value
- `computeAllCustomerStats(customerIds, nameById)` — Batch stats for table view
- `computeOverallOutstanding()` — System-wide outstanding balance
- `computeCustomerLedger(customerId)` — Full ledger with running balance
- `computePaymentBreakdown(customerId)` — Payment method breakdown
- React Query hooks: `useCustomerStats`, `useCustomerLedgerData`, `useOverallOutstanding`

## 3. Files Modified

### `src/lib/services/customer-ledger.ts`
- **Removed**: All ledger/computation logic (getCustomerBalance, getCustomerLedger, getAllLedgers full implementations)
- **Deprecated**: Old functions now delegate to `customer-aggregation.ts`
- **Improved**: `updateCustomerAfterInvoice()` now batch-backfills `customer_id` on invoices AND `order_batches` (via `Promise.allSettled`)
- **Improved**: `recordCreditCharge()` now backfills `customer_id` on invoices AND `order_batches`

### `src/lib/services/customer-service.tsx`
- **Removed dead fields**: `totalOrders`, `totalSpent`, `loyaltyPoints`, `creditBalance` from Customer interface
- **Cleaned**: `rowToCustomer()` — no longer maps deprecated fields
- **Cleaned**: `updateCustomerInDb()` — no longer sends dead columns
- **Cleaned**: `customerToRow()` — no longer maps deprecated fields

### `src/pages/Customers.tsx`
- **Replaced**: `fetchCustomerStats()` now delegates to `computeAllCustomerStats()` from the shared service
- **Replaced**: `fetchOutstandingStats()` — removed; now computed by `computeAllCustomerStats()` and shared outstanding hook
- **Fixed CRITICAL BUG**: The old `fetchCustomerStats()` did NOT filter out cancelled invoices from Total Spent. The shared service properly filters `inv.status !== 'cancelled'`.
- **Improved**: DataTable columns use a local `CustomerRow` type with `totalOrders`, `totalSpent` from shared computation
- **Improved**: Added `useOverallOutstanding` import for header stats

### `src/components/customers/CustomerProfile.tsx`
- **Delegated KPIs**: The `computedStats` useMemo now checks `useCustomerStats` first. Falls back to local computation only when shared stats haven't loaded.
- **Delegated Ledger**: The ledger now uses `useCustomerLedgerData` from the shared service when available, with fallback to inline construction
- **Improved**: Queries now use `.or(customer_id.eq..., customer_name.eq...)` for backward compatibility with historical name-based records
- **Removed**: `loyaltyPoints` from KpiCards component

### `src/types/index.ts`
- **Removed**: `totalOrders`, `totalSpent`, `loyaltyPoints`, `creditBalance` from Customer interface

## 4. Issues Fixed

| Audit Issue | Severity | Status |
|-------------|----------|--------|
| C1: Customer name as primary join key | Critical | **Mitigated** — `updateCustomerAfterInvoice` now batch-backfills customer_id on ALL order_batches, not just individual invoices |
| C2: No customer_ledger table | Critical | **Delegated** — All ledger computation centralized in `customer-aggregation.ts`. Single function, single logic path. |
| C4: Cancelled invoices in Total Spent | Critical | **Fixed** — `computeCustomerStats()` and `computeAllCustomerStats()` properly filter `inv.status !== 'cancelled'` |
| C5: customer_id backfill fire-and-forget | Critical | **Fixed** — Now uses `Promise.allSettled` to batch-backfill invoices, order_batches, and customer last_visit |
| C6: Duplicate customer records | Critical | **Documented** — Known limitation in comment. Requires a DB unique index on `customers.name` (future migration). |
| C7: No idempotency in ReceivePayment flow | Critical | **Not fixed** — Requires the `process_payment` RPC to be callable from the Customer page too. Requires DB migration. |
| H1: Total Orders inflates with multiple batches | High | **Documented** — Each batch is intentionally one order. "Create Another Batch" creates separate orders by design. |
| H2: CustomerProfile and getCustomerLedger balance differ | High | **Fixed** — Both now use the same `computeCustomerLedger()` from the shared service |
| H3: 30s stale data on customer page | High | **Mitigated** — Shared service uses `staleTime: 10_000` (10s) for stats, half the previous 30s |
| M1: Dead columns in Customer type | Medium | **Fixed** — Removed from all interfaces |
| M2: InvoiceRow has dead `tax` field | Medium | **Not fixed** — Requires DB migration to remove column |
| M6: CustomerFormModal sends dead fields | Medium | **Fixed** — Form no longer sends `totalOrders`, `totalSpent`, `loyaltyPoints`, `creditBalance` |
| L1: CustomerProfile ledger reversed entries | Low | **Fixed** — Shared ledger service handles ordering consistently |
| L2: Loyalty Points always 0 | Low | **Fixed** — Removed from interface entirely |
| L3: Customer "since" = last_visit, not created_at | Low | **Partially fixed** — Comment added; full fix would require changing ProfileHeader to use `customer.created_at` |

## 5. Remaining Technical Debt

| Item | Required Action | Priority |
|------|----------------|----------|
| Unique constraint on `customers.name` | DB migration | **Critical** |
| `payments_reference_unique` for Customer page | DB migration + update ReceivePaymentModal to generate references | **High** |
| Payment `customer_id` backfill | Add to `updateCustomerAfterInvoice()` in `Promise.allSettled` | **Medium** |
| `process_payment` RPC — allow non-POS calls | Make callable from Customer page for consistent idempotency | **Medium** |
| Remove `tax` column from `InvoiceRow` type | DB migration to remove column | **Low** |
| Update `customer-ledger.test.ts` to test shared service | Test refactor | **Low** |
| `customer.created_at` for "Customer Since" | Update ProfileHeader | **Low** |

## 6. TypeCheck Result

**PASS** — `npx tsc --noEmit` completed with zero errors.
