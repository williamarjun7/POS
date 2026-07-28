/**
 * InvoiceTemplate
 * ───────────────
 * Single source of truth for Invoice receipt printing.
 *
 * Architecture (mirrors KotTemplate.tsx):
 *   - `renderInvoiceHtml()` is the ONLY HTML generator — used by print-service.ts
 *   - The React component `InvoiceTemplate` delegates to `renderInvoiceHtml()` via
 *     dangerouslySetInnerHTML so there is exactly one layout definition.
 *   - Paper size is respected (58mm, 80mm, or A4) — never hardcoded.
 *
 * Design principles:
 *   - Clean, scannable layout optimized for customer receipts
 *   - Business name, address, phone, PAN at top
 *   - Items table with qty and amount columns
 *   - Payment breakdown section
 *   - Subtotal, Discount, TOTAL
 *   - Thank you message + QR codes
 *   - Bill Preview mode shows "BILL PREVIEW" badge instead of "Thank You" / QRs
 *   - No KOT-specific content or logic
 */

import { useState, useEffect } from 'react';
import { ThermalPrinterLayout } from './ThermalPrinterLayout';
import { usePrintSettings } from '@/lib/services/print-settings';
import type { PaperSize } from '@/lib/services/print-settings';
import logoSrc from '@/assets/logo.png';
import QRCode from 'qrcode';
import { getPaymentMethodLabel } from '@/lib/payment-methods';

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
  cashierName?: string;
  tableOrRoom?: string;
  items: InvoiceLineItem[];
  subtotal: number;
  discount?: number;
  total: number;
  /** Optional payment breakdown shown on the receipt */
  paymentBreakdown?: Array<{ method: string; amount: number; discount?: number }>;
}

export interface InvoiceRenderOptions {
  /** Paper size for @page CSS */
  paperSize: PaperSize;
  /** Whether to show the business logo */
  showLogo: boolean;
  /** Business phone number displayed on receipt */
  phone: string;
  /** Business PAN / VAT number displayed on receipt */
  pan: string;
  /** Pre-loaded logo data URI (or empty string to use fallback) */
  logoDataUri?: string;
  /** Pre-generated QR code data URIs for the footer */
  qrCodes?: Array<{ dataUri: string; label: string }>;
  /** If true, renders as a "BILL PREVIEW" / proforma (no thank-you, no QRs) */
  isPreview?: boolean;
  /** If true, renders a "TEST RECEIPT" watermark */
  isTest?: boolean;
}

/* ─── Helpers ───────────────────────────────────────────────── */

const fmt = (amount: number) =>
  amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function itemsToHtml(items: InvoiceLineItem[]): string {
  return items
    .map(
      (item) => `
        <div class="item">
          <div class="item-row">
            <span class="item-name">${escapeHtml(item.name)}</span>
            <span class="item-qty">${item.quantity}</span>
            <span class="item-amount">${fmt(item.unitPrice * item.quantity)}</span>
          </div>
          ${(item.modifiers ?? []).map((m) => `<div class="sub-line">&bull; ${escapeHtml(m)}</div>`).join('')}
          ${(item.addons ?? []).map((a) => `<div class="sub-line">+ ${escapeHtml(a)}</div>`).join('')}
          ${item.notes ? `<div class="sub-line note">Note: ${escapeHtml(item.notes)}</div>` : ''}
        </div>`
    )
    .join('');
}

function qrFooterHtml(qrCodes: Array<{ dataUri: string; label: string }>, paperSize: string): string {
  if (qrCodes.length === 0) return '';

  const isNarrow = paperSize === '58mm';

  if (isNarrow) {
    const qrSize = '36mm';
    return qrCodes
      .map(
        (qr) => `
        <div style="margin-bottom:2mm">
          <img src="${qr.dataUri}" alt="${escapeHtml(qr.label)}" style="height:${qrSize};width:${qrSize};margin:0 auto;image-rendering:crisp-edges;background:#fff" />
          <div style="font-size:10px;font-weight:600;margin-top:0.3mm">${escapeHtml(qr.label)}</div>
        </div>`,
      )
      .join('');
  }

  const qrCount = qrCodes.length;
  const qrSize = qrCount === 3 ? '22mm' : qrCount === 2 ? '30mm' : '40mm';
  const labelSize = qrCount === 3 ? '9px' : qrCount === 2 ? '10px' : '11px';

  return `
  <div style="display:flex;justify-content:center;gap:1.5mm;flex-wrap:wrap">
    ${qrCodes
      .map(
        (qr) => `
      <div style="text-align:center">
        <img src="${qr.dataUri}" alt="${escapeHtml(qr.label)}" style="height:${qrSize};width:${qrSize};image-rendering:crisp-edges;background:#fff" />
        <div style="font-size:${labelSize};font-weight:600;margin-top:0.3mm">${escapeHtml(qr.label)}</div>
      </div>`,
      )
      .join('')}
  </div>`;
}

/* ─── Shared Invoice HTML — SINGLE SOURCE OF TRUTH ─────────── */

/**
 * Render an invoice receipt as a complete HTML document for iframe printing.
 *
 * This is the SINGLE source of truth for invoice layout. The React
 * component below delegates to this function.
 *
 * @param invoice - The invoice data
 * @param options - Rendering options (paper size, logo, QR codes, preview/test flags)
 */
export function renderInvoiceHtml(
  invoice: InvoiceData,
  options: InvoiceRenderOptions,
): string {
  const hasDiscount = (invoice.discount ?? 0) > 0;
  const hasPaymentBreakdown = invoice.paymentBreakdown && invoice.paymentBreakdown.length > 0;
  const imgLogo = options.logoDataUri || logoSrc;
  const pageSize = options.paperSize === 'A4' ? '210mm 297mm' : `${options.paperSize} auto`;
  const bodyWidth = options.paperSize === 'A4' ? '190mm' : options.paperSize;
  const phone = escapeHtml(options.phone);
  const pan = escapeHtml(options.pan);
  const safeInvoiceNumber = escapeHtml(invoice.invoiceNumber);

  const itemsHtml = itemsToHtml(invoice.items);
  const qrSection = (options.qrCodes ?? []).length > 0
    ? qrFooterHtml(options.qrCodes ?? [], options.paperSize)
    : '';

  // ── Payment breakdown HTML ──
  let paymentHtml = '';
  if (hasPaymentBreakdown) {
    const rows = (invoice.paymentBreakdown ?? []).map(p => {
      const label = escapeHtml(getPaymentMethodLabel(p.method));
      const hasPmtDiscount = (p.discount ?? 0) > 0;
      return `<div class="row" style="font-size:12px;font-weight:500;margin-bottom:0.5mm">
        <span>${label}</span>
        <span>${hasPmtDiscount ? `<span style="color:#c00;font-size:11px;font-weight:600">-${fmt(p.discount!)} </span>` : ''}${fmt(p.amount)}</span>
      </div>`;
    }).join('');
    paymentHtml = `
  <div style="margin-bottom:1.2mm">
    <div style="font-weight:600;font-size:12px;margin-bottom:0.8mm">Payment</div>
    ${rows}
  </div>
  <div class="divider"></div>`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>${options.isPreview ? 'Bill Preview' : options.isTest ? 'Test Receipt' : `Invoice ${safeInvoiceNumber}`}</title>
<style>
  @page { size: ${pageSize}; margin: 0; }
  body { margin:0; padding:2mm 3mm 4mm; width:${bodyWidth}; max-width:${bodyWidth}; font-family:system-ui,'Segoe UI',Arial,sans-serif; font-size:12px; line-height:1.4; font-variant-numeric:tabular-nums; color:#000; background:#fff; }
  img { display:block; }
  .center { text-align:center; }
  .divider { border-top:1px dashed #000; margin:2.5mm 0; }
  .row { display:flex; justify-content:space-between; }
  .item { margin-bottom:1.2mm; }
  .item-row { display:flex; justify-content:space-between; align-items:baseline; }
  .item-name { flex:1; font-weight:500; padding-right:2mm; font-size:12px; }
  .item-qty { width:12mm; text-align:right; font-size:12px; font-weight:500; }
  .item-amount { width:18mm; text-align:right; font-weight:500; font-size:12px; }
  .sub-line { padding-left:4mm; font-size:10px; font-weight:500; }
  .note { font-style:italic; }
  .totals { margin-top:2mm; }
  .totals .row { font-size:12px; font-weight:500; margin-bottom:0.5mm; }
  .total-line { border-top:1.5px solid #000; margin-top:1.5mm; padding-top:1.5mm; display:flex; justify-content:space-between; font-weight:800; font-size:18px; }
  .badge-preview { font-size:11px; font-weight:700; color:#c00; letter-spacing:1px; border:1.5px solid #c00; display:inline-block; padding:1mm 3mm; margin:1mm 0; }
  .badge-test { font-size:11px; font-weight:700; color:#e67e22; letter-spacing:1px; border:1.5px solid #e67e22; display:inline-block; padding:1mm 3mm; margin:1mm 0; }
  @media print { body { margin:0; padding:2mm 3mm 4mm; } }
</style></head>
<body>
  ${options.isPreview ? '' : options.isTest ? `
  <div class="center" style="margin-bottom:1mm">
    <div class="badge-test">*** TEST RECEIPT ***</div>
  </div>` : ''}
  <div class="center" style="margin-top:-6px">
    ${options.showLogo ? `<img src="${imgLogo}" alt="Logo" style="height:22mm;max-width:100%;margin:0 auto;image-rendering:crisp-edges" />` : ''}
    <div style="font-size:18px;font-weight:700;letter-spacing:0.5px;${options.showLogo ? 'margin-top:5px' : ''}">Highlands Cafe &amp; Motel Inn</div>
    <div style="font-size:12px;font-weight:500;margin-top:1mm">Premium Stays &bull; Great Coffee</div>
    <div style="font-size:11px;font-weight:500;margin-top:1.5mm;line-height:1.5">Birendranagar-8, Khajura<br />Surkhet, Nepal<br />Phone: ${phone}<br />PAN: ${pan}</div>
    ${options.isPreview ? `<div class="badge-preview">BILL PREVIEW</div>` : ''}
  </div>
  <div class="divider"></div>
  <div style="margin-bottom:2.5mm">
    <div style="font-weight:600;font-size:13px">${options.isTest ? 'Invoice #TEST-001' : `Invoice #${safeInvoiceNumber}`}</div>
    <div class="row" style="font-size:12px;font-weight:500;margin-top:0.5mm"><span>Date : ${escapeHtml(invoice.date)}</span><span>Time : ${escapeHtml(invoice.time)}</span></div>
    ${invoice.cashierName ? `<div style="font-size:11px;font-weight:500;margin-top:0.3mm;color:#555">Cashier : ${escapeHtml(invoice.cashierName)}</div>` : ''}
    ${invoice.tableOrRoom ? `<div style="font-size:11px;font-weight:500;margin-top:0.3mm;color:#555">${escapeHtml(invoice.tableOrRoom)}</div>` : ''}
  </div>
  <div class="divider"></div>
  <div class="row" style="font-weight:600;font-size:12px;border-bottom:1px dashed #000;padding-bottom:1.5mm;margin-bottom:1.5mm">
    <span style="flex:1">Item</span><span style="width:12mm;text-align:right">Qty</span><span style="width:18mm;text-align:right">Amount</span>
  </div>
  ${itemsHtml}
  <div class="divider"></div>
  ${paymentHtml}
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${fmt(invoice.subtotal)}</span></div>
    ${hasDiscount ? `<div class="row"><span>Discount</span><span style="color:#c00">-${fmt(invoice.discount ?? 0)}</span></div>` : ''}
    <div class="total-line"><span>TOTAL</span><span>${fmt(invoice.total)}</span></div>
  </div>
  ${options.isPreview ? `
  <div class="divider"></div>
  <div class="center" style="font-size:10px;font-weight:500;color:#c00">
    *** This is a BILL PREVIEW — Not a Final Invoice ***
  </div>` : `
  <div class="divider"></div>
  <div class="center" style="margin-top:2.5mm">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.5px;line-height:1.5;margin-bottom:0.5mm">
      Thank You for Visiting!<br />We Hope to See You Again
    </div>
    ${qrSection ? `<div class="divider" style="margin:2mm 0"></div><div style="font-size:11px;font-weight:600;margin-bottom:1.5mm">Connect With Us</div>${qrSection}<div style="font-size:9px;font-weight:500;margin-top:1.5mm;line-height:1.4;color:#555">Leave us a review and follow us for the latest updates!</div>` : `<div style="font-size:11px;font-weight:500;margin-bottom:2mm">Thank you for your visit!</div>`}
    <div style="font-size:11px;font-weight:500;margin-top:1.5mm;line-height:1.5">highlandscafemotelinn.com</div>
  </div>`}
</body>
</html>`;
}

/* ─── React Component (wraps renderInvoiceHtml) ─────────────── */

interface InvoiceTemplateProps {
  invoice: InvoiceData;
}

export function InvoiceTemplate({ invoice }: InvoiceTemplateProps) {
  const { settings } = usePrintSettings();
  const [googleQr, setGoogleQr] = useState<string>('');
  const [instagramQr, setInstagramQr] = useState<string>('');
  const [tiktokQr, setTiktokQr] = useState<string>('');

  // Generate all QR codes
  useEffect(() => {
    let cancelled = false;

    const generateQr = async (url: string | undefined, enabled: boolean): Promise<string> => {
      if (!enabled || !url) return '';
      try {
        return await QRCode.toDataURL(url, {
          width: 512,
          margin: 4,
          color: { dark: '#000000', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        });
      } catch {
        return '';
      }
    };

    (async () => {
      const [google, instagram, tiktok] = await Promise.all([
        generateQr(settings.googleReviewUrl, settings.enableGoogleReviewQr),
        generateQr(settings.instagramUrl, settings.enableInstagramQr),
        generateQr(settings.tiktokUrl, settings.enableTiktokQr),
      ]);

      if (cancelled) return;
      if (google) setGoogleQr(google);
      if (instagram) setInstagramQr(instagram);
      if (tiktok) setTiktokQr(tiktok);
    })();

    return () => { cancelled = true; };
  }, [
    settings.googleReviewUrl, settings.enableGoogleReviewQr,
    settings.instagramUrl, settings.enableInstagramQr,
    settings.tiktokUrl, settings.enableTiktokQr,
  ]);

  // Build active QR list
  const activeQrs: Array<{ dataUri: string; label: string }> = [];
  if (googleQr) activeQrs.push({ dataUri: googleQr, label: 'Google Review' });
  if (instagramQr) activeQrs.push({ dataUri: instagramQr, label: 'Follow Instagram' });
  if (tiktokQr) activeQrs.push({ dataUri: tiktokQr, label: 'Follow TikTok' });

  const html = renderInvoiceHtml(invoice, {
    paperSize: settings.paperSize,
    showLogo: settings.showLogo,
    phone: settings.phone,
    pan: settings.pan,
    qrCodes: activeQrs.length > 0 ? activeQrs : undefined,
    isPreview: false,
    isTest: false,
  });

  return (
    <ThermalPrinterLayout>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </ThermalPrinterLayout>
  );
}
