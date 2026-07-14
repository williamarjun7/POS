/**
 * InvoiceTemplate
 * ───────────────
 * Customer-facing invoice receipt for 80mm thermal printing.
 *
 * Displays ONLY customer-relevant information:
 *   - Logo / Business branding
 *   - Invoice #, Date, Time
 *   - Items with variants/add-ons/notes
 *   - Subtotal, Discount (if > 0), Total
 *   - Thank-you message, Google Review QR, website
 *
 * Does NOT display: table number, cashier, guest count, payment history,
 *   payment status, paid/remaining amounts, service charge, VAT, internal IDs.
 */

import { ThermalPrinterLayout } from './ThermalPrinterLayout';
import { usePrintSettings } from '@/lib/services/print-settings';
import logoSrc from '@/assets/logo.png';
import reviewQrSrc from '@/assets/review.png';

/* ─── Types ─────────────────────────────────────────────────── */

export interface InvoiceLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
  /** e.g. "Steam", "Extra Spicy" — shown as indented sub-lines */
  modifiers?: string[];
  addons?: string[];
  notes?: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  time: string;
  items: InvoiceLineItem[];
  subtotal: number;
  discount?: number;
  total: number;
}

/* ─── Helpers ───────────────────────────────────────────────── */

const fmt = (amount: number) =>
  amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ─── Component ─────────────────────────────────────────────── */

interface InvoiceTemplateProps {
  invoice: InvoiceData;
}

export function InvoiceTemplate({ invoice }: InvoiceTemplateProps) {
  const hasDiscount = (invoice.discount ?? 0) > 0;
  const { settings } = usePrintSettings();

  return (
    <ThermalPrinterLayout>
      {/* ── Header ── */}
      <div style={{ textAlign: 'center', marginBottom: '3mm' }}>
        {settings.showLogo && (
          <img
            src={logoSrc}
            alt="Logo"
            style={{ height: '18mm', marginBottom: '1.5mm', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}
          />
        )}
        <div style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.5px' }}>
          Highlands Cafe &amp; Motel Inn
        </div>
        <div style={{ fontSize: '8px', color: '#555', marginTop: '0.5mm' }}>
          Premium Stays &bull; Great Coffee
        </div>
        <div style={{ fontSize: '8px', color: '#555', marginTop: '1mm' }}>
          Birendranagar-8, Khajura<br />
          Surkhet, Nepal<br />
          Phone: {settings.phone}<br />
          PAN: {settings.pan}
        </div>
      </div>

      {/* ── Divider ── */}
      <Divider />

      {/* ── Invoice Info ── */}
      <div style={{ marginBottom: '2mm' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700 }}>Invoice #{invoice.invoiceNumber}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#555' }}>
          <span>Date : {invoice.date}</span>
          <span>Time : {invoice.time}</span>
        </div>
      </div>

      {/* ── Divider ── */}
      <Divider />

      {/* ── Items Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontWeight: 700,
          fontSize: '9px',
          borderBottom: '1px dashed #999',
          paddingBottom: '1mm',
          marginBottom: '1mm',
        }}
      >
        <span style={{ flex: 1 }}>Item</span>
        <span style={{ width: '12mm', textAlign: 'right' }}>Qty</span>
        <span style={{ width: '18mm', textAlign: 'right' }}>Amount</span>
      </div>

      {/* ── Items ── */}
      {invoice.items.map((item, idx) => (
        <div key={idx} style={{ marginBottom: '1mm' }}>
          {/* Main line */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ flex: 1, fontWeight: 500, paddingRight: '2mm' }}>{item.name}</span>
            <span style={{ width: '12mm', textAlign: 'right', fontSize: '9px' }}>{item.quantity}</span>
            <span style={{ width: '18mm', textAlign: 'right', fontWeight: 500 }}>
              {fmt(item.unitPrice * item.quantity)}
            </span>
          </div>

          {/* Modifiers (indented sub-rows) */}
          {item.modifiers?.map((mod, mi) => (
            <div key={`mod-${mi}`} style={{ paddingLeft: '4mm', fontSize: '8px', color: '#555' }}>
              &bull; {mod}
            </div>
          ))}

          {/* Add-ons */}
          {item.addons?.map((addon, ai) => (
            <div key={`add-${ai}`} style={{ paddingLeft: '4mm', fontSize: '8px', color: '#555' }}>
              + {addon}
            </div>
          ))}

          {/* Notes */}
          {item.notes && (
            <div style={{ paddingLeft: '4mm', fontSize: '8px', color: '#888', fontStyle: 'italic' }}>
              Note: {item.notes}
            </div>
          )}
        </div>
      ))}

      {/* ── Totals ── */}
      <Divider />
      <div style={{ marginTop: '1mm' }}>
        <Row label="Subtotal" value={fmt(invoice.subtotal)} />
        {hasDiscount && (
          <Row label="Discount" value={`-${fmt(invoice.discount ?? 0)}`} valueColor="#c00" />
        )}
        <div
          style={{
            borderTop: '1px solid #000',
            marginTop: '1mm',
            paddingTop: '1mm',
            display: 'flex',
            justifyContent: 'space-between',
            fontWeight: 700,
            fontSize: '12px',
          }}
        >
          <span>TOTAL</span>
          <span>{fmt(invoice.total)}</span>
        </div>
      </div>

      {/* ── Footer ── */}
      <Divider />
      <div style={{ textAlign: 'center', marginTop: '2mm' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, marginBottom: '1.5mm' }}>
          Thank You For Visiting!
        </div>
        <img
          src={reviewQrSrc}
          alt="Google Review QR"
          style={{ height: '16mm', display: 'block', margin: '0 auto 1.5mm' }}
        />
        <div style={{ fontSize: '8px', color: '#555' }}>
          highlandscafemotelinn.com
        </div>
      </div>
    </ThermalPrinterLayout>
  );
}

/* ─── Sub-components ────────────────────────────────────────── */

function Divider() {
  return (
    <div
      style={{
        borderTop: '1px dashed #aaa',
        margin: '2mm 0',
      }}
    />
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '0.5mm' }}>
      <span>{label}</span>
      <span style={{ color: valueColor ?? '#000' }}>{value}</span>
    </div>
  );
}
