export const InvoiceStatus = {
  PENDING: 'pending',
  PAID: 'paid',
  PARTIAL: 'partial',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  CREDIT_INVOICE: 'credit_invoice',
} as const
export type InvoiceStatus = typeof InvoiceStatus[keyof typeof InvoiceStatus]

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  paid: 'Paid',
  partial: 'Partial',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  credit_invoice: 'Credit Invoice',
}

export const PAYMENT_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-warning/10 text-warning border-warning/20',
  paid: 'bg-success/10 text-success border-success/20',
  partial: 'bg-info/10 text-info border-info/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
  refunded: 'bg-secondary text-secondary-foreground border-border',
  credit_invoice: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
}

interface PaymentLog {
  id?: string;
  amount?: number;
  payment_method?: string;
  status?: string;
}

export function getNonCreditPaidAmount(paymentLogs: PaymentLog[]): number {
  if (!paymentLogs || !Array.isArray(paymentLogs)) return 0
  return paymentLogs
    .filter(log => log.payment_method !== 'credit' && log.status === 'completed')
    .reduce((sum, log) => sum + (log.amount || 0), 0)
}

export function getTotalInvoiceAmount(invoice: { totalAmount?: number; total?: number }): number {
  return invoice.totalAmount || invoice.total || 0
}
