import { motion } from 'framer-motion';
import { ArrowLeft, Smartphone, Check, Loader2, AlertCircle } from 'lucide-react';

const npr = (amount: number) =>
  `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

interface ReceptionQRDialogProps {
  amount: number;
  orderId?: string;
  customerName?: string;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
}

export function ReceptionQRDialog({ amount, customerName, onConfirm, onCancel, submitting }: ReceptionQRDialogProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold">Reception QR</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Invoice Total Card */}
        <div className="rounded-xl border bg-muted/30 p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Invoice Total</span>
            <span className="text-2xl font-bold tabular-nums">{npr(amount)}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-sky-50 dark:bg-sky-950/20 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
            <Smartphone className="h-4 w-4 shrink-0" />
            <span>Customer pays using the static QR displayed at the reception.</span>
          </div>
        </div>

        {/* Order Info */}
        {customerName && (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Customer</span>
              <span className="font-medium">{customerName}</span>
            </div>
          </div>
        )}

        {/* Confirmation hint */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2.5">
          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Only click <strong>Confirm Payment</strong> after verifying the customer has successfully paid via their banking app.
          </p>
        </div>
      </div>

      {/* Footer - Single Confirm button matching Cash layout style */}
      <div className="p-4 border-t shrink-0">
        <button
          onClick={onConfirm}
          disabled={submitting}
          className="w-full h-14 rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:from-sky-400 hover:to-blue-400 transition-all active:scale-[0.99] shadow-sm"
        >
          {submitting ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Processing...</>
          ) : (
            <><Check className="h-5 w-5" /> Confirm Payment</>
          )}
        </button>
      </div>
    </motion.div>
  );
}
