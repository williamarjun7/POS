/**
 * KotTemplate
 * ────────────
 * Single source of truth for Kitchen Order Ticket (KOT) printing.
 *
 * Architecture:
 *   - `renderKotHtml()` is the ONLY HTML generator — used by print-service.ts
 *   - The React component `KotTemplate` delegates to `renderKotHtml()` via
 *     dangerouslySetInnerHTML so there is exactly one layout definition.
 *   - Paper size is respected (58mm or 80mm) — never hardcoded.
 *
 * Design principles:
 *   - Clean, scannable layout optimized for kitchen staff speed
 *   - Large bold order numbers, table labels, and item names
 *   - Modifiers and notes indented below items
 *   - TOTAL QTY instead of prices (prices belong on customer receipts only)
 *   - No phone, PAN, website, QR codes, or marketing text
 *   - Customer and staff names hidden by default (togglable via Print Settings)
 */

import { usePrintSettings } from '@/lib/services/print-settings';

/* ─── Types ─────────────────────────────────────────────────── */

export interface KotLineItem {
  name: string;
  quantity: number;
  /** Optional modifiers (e.g. "Extra Spicy", "Steam") */
  modifiers?: string[];
  /** Optional add-ons */
  addons?: string[];
  /** Special instructions */
  notes?: string;
  /** @default 'dine_in' */
  servingType?: 'dine_in' | 'takeaway';
}

export interface KotData {
  /** Display order number (e.g. "Order #002") */
  orderNumber: string;
  /** Table, room, TAKEAWAY, or DELIVERY label */
  tableOrRoom: string;
  /** Customer / guest name (only printed when setting enabled) */
  customerName?: string;
  /** Waiter / cashier name (only printed when setting enabled) */
  waiterName?: string;
  /** Date string */
  date: string;
  /** Time string */
  time: string;
  /** Line items for the kitchen */
  items: KotLineItem[];
}

/* ─── Helpers ───────────────────────────────────────────────── */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function totalQty(items: KotLineItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/* ─── Single Source of Truth: Static HTML Renderer ──────────── */

/**
 * Render a KOT as a complete HTML document for iframe printing.
 *
 * This is the SINGLE source of truth for KOT layout. The React
 * component below delegates to this function.
 *
 * @param data        - The order data to print
 * @param paperSize   - '58mm' or '80mm' (from PrintSettings)
 * @param showCustomer - Whether to print the customer name
 * @param showStaff   - Whether to print the waiter/staff name
 */
export function renderKotHtml(
  data: KotData,
  paperSize: string,
  showCustomer: boolean,
  showStaff: boolean,
): string {
  const bodyWidth = paperSize === '80mm' ? '76mm' : '54mm';
  const pageSize  = `${paperSize} auto`;
  const fontScale = paperSize === '58mm' ? '0.9' : '1';

  const itemsHtml = data.items
    .map(
      (item) => `
        <div class="ki">
          <div class="ki-row">
            <span class="ki-qty">${item.quantity}</span>
            <span class="ki-name">${escapeHtml(item.name)}</span>
          </div>
          ${item.servingType === 'takeaway' ? `<div class="ki-sub ki-takeaway">📦 Takeaway</div>` : ''}
          ${(item.modifiers ?? []).map((m) => `<div class="ki-sub">&bull; ${escapeHtml(m)}</div>`).join('')}
          ${(item.addons ?? []).map((a) => `<div class="ki-sub">+ ${escapeHtml(a)}</div>`).join('')}
          ${item.notes ? `<div class="ki-sub ki-note">Note: ${escapeHtml(item.notes)}</div>` : ''}
        </div>`,
    )
    .join('');

  const total = totalQty(data.items);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>KOT - ${escapeHtml(data.orderNumber)}</title>
<style>
  @page { size: ${pageSize}; margin: 0; }
  body { margin:0; padding:2.5mm 2mm; width:${bodyWidth}; max-width:${bodyWidth};
         font-family:system-ui,'Segoe UI',Arial,sans-serif;
         font-size:${fontScale === '0.9' ? '10px' : '12px'}; line-height:1.45;
         font-variant-numeric:tabular-nums; color:#000; background:#fff; }
  * { box-sizing:border-box; }
  .c { text-align:center; }
  .br { border-top:1.5px dashed #000; margin:1.8mm 0; }
  .br-s { border-top:2px solid #000; margin:2mm 0; }

  /* ── Header ── */
  .hdr { text-align:center; margin-bottom:1.5mm; }
  .hdr .brand { font-size:${fontScale === '0.9' ? '14px' : '16px'}; font-weight:800; letter-spacing:0.8px; }
  .hdr .tag { font-size:${fontScale === '0.9' ? '10px' : '12px'}; font-weight:700; margin-top:0.3mm; letter-spacing:1px; }

  /* ── Order Info ── */
  .oi { margin-bottom:1.2mm; }
  .oi .row1 { display:flex; justify-content:space-between; align-items:baseline; }
  .oi .ord { font-weight:800; font-size:${fontScale === '0.9' ? '14px' : '16px'}; }
  .oi .loc { font-weight:700; font-size:${fontScale === '0.9' ? '11px' : '13px'}; }
  .oi .row2 { display:flex; justify-content:space-between; font-size:${fontScale === '0.9' ? '10px' : '11px'}; font-weight:500; margin-top:0.4mm; color:#444; }
  .oi .extra { font-size:${fontScale === '0.9' ? '10px' : '11px'}; font-weight:500; margin-top:0.3mm; color:#555; }

  /* ── Items Column Header ── */
  .col-hdr { display:flex; font-weight:700; font-size:${fontScale === '0.9' ? '10px' : '12px'};
             border-bottom:1px dashed #000; padding-bottom:0.8mm; margin-bottom:1.2mm;
             text-transform:uppercase; letter-spacing:0.5px; }
  .col-hdr .cq { width:8mm; text-align:center; }
  .col-hdr .cn { flex:1; padding-left:0.5mm; }

  /* ── Items ── */
  .ki { margin-bottom:1.2mm; }
  .ki-row { display:flex; align-items:baseline; gap:1mm; }
  .ki-qty { width:8mm; font-weight:800; font-size:${fontScale === '0.9' ? '12px' : '14px'}; text-align:center; }
  .ki-name { flex:1; font-weight:600; font-size:${fontScale === '0.9' ? '11px' : '13px'}; }
  .ki-sub { padding-left:10mm; font-size:${fontScale === '0.9' ? '10px' : '11px'}; font-weight:500; color:#444; }
  .ki-note { font-style:italic; color:#c00; }
  .ki-takeaway { color:#e67e22; font-weight:700; font-size:${fontScale === '0.9' ? '10px' : '11px'}; letter-spacing:0.5px; }

  /* ── Totals ── */
  .tot { margin-top:1.5mm; font-weight:700; font-size:${fontScale === '0.9' ? '11px' : '13px'}; }
  .tot-r { display:flex; justify-content:space-between; }

  @media print { body { margin:0; padding:2.5mm 2mm; } }
</style></head>
<body>
  <!-- ── Header ── -->
  <div class="hdr">
    <div class="brand">HIGHLANDS CAFE &amp; MOTEL INN</div>
    <div class="tag">&#9733; KITCHEN ORDER &#9733;</div>
  </div>

  <div class="br-s"></div>

  <!-- ── Order Info ── -->
  <div class="oi">
    <div class="row1">
      <span class="ord">${escapeHtml(data.orderNumber)}</span>
      <span class="loc">${escapeHtml(data.tableOrRoom)}</span>
    </div>
    <div class="row2">
      <span>${escapeHtml(data.date)}</span>
      <span>${escapeHtml(data.time)}</span>
    </div>
    ${showCustomer && data.customerName ? `<div class="extra">Customer: ${escapeHtml(data.customerName)}</div>` : ''}
    ${showStaff && data.waiterName ? `<div class="extra">Staff: ${escapeHtml(data.waiterName)}</div>` : ''}
  </div>

  <div class="br"></div>

  <!-- ── Items Column Header ── -->
  <div class="col-hdr">
    <span class="cq">Qty</span>
    <span class="cn">Item</span>
  </div>

  <!-- ── Items ── -->
  ${itemsHtml}

  <div class="br-s"></div>

  <!-- ── Total Qty ── -->
  <div class="tot">
    <div class="tot-r">
      <span>TOTAL QTY</span>
      <span>${total}</span>
    </div>
  </div>
</body>
</html>`;
}

/* ─── React Component (wraps renderKotHtml) ─────────────────── */

interface KotTemplateProps {
  kot: KotData;
}

export function KotTemplate({ kot }: KotTemplateProps) {
  const { settings } = usePrintSettings();

  const html = renderKotHtml(
    kot,
    settings.paperSize,
    settings.showCustomerOnKot,
    settings.showStaffOnKot,
  );

  return (
    <div
      className="mx-auto bg-white text-black print:bg-white"
      style={{
        width: settings.paperSize === '80mm' ? '76mm' : '54mm',
        maxWidth: settings.paperSize === '80mm' ? '76mm' : '54mm',
        fontFamily: "system-ui, 'Segoe UI', Arial, sans-serif",
        fontSize: settings.paperSize === '58mm' ? '10px' : '12px',
        lineHeight: 1.45,
        fontVariantNumeric: 'tabular-nums',
        color: '#000',
        backgroundColor: '#fff',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
