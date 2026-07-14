/**
 * Validation — barrel export
 * ──────────────────────────
 *
 * Import validation schemas and helpers from here:
 *   import { paymentSchemas, validateOrThrow } from '@/lib/validation'
 */

export {
  paymentSchemas,
  orderBatchSchemas,
  orderBatchItemSchemas,
  invoiceSchemas,
  invoiceItemSchemas,
  customerLedgerSchemas,
  expenseSchemas,
  customerSchemas,
  inventorySchemas,
  bookingSchemas,
  formatZodError,
  validateOrThrow,
} from './schemas'

// Re-export inferred types from schemas as needed:
// export type { CreatePaymentData } from './schemas'
