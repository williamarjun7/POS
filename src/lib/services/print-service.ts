/**
 * PrintService
 * ─────────────
 * Encapsulates all printing logic for invoices.
 *
 * Usage:
 *   import { printService } from '@/lib/services/print-service';
 *
 *   // Print customer invoice
 *   await printService.printInvoice(invoiceData);
 *
 * Extensible for future:
 *   - Thermal printer direct output via WebUSB / Network
 *   - A4/PDF fallback
 */

import type { InvoiceData } from '@/components/printing/InvoiceTemplate';
import { getPrintSettings } from '@/lib/services/print-settings';
import QRCode from 'qrcode';

/* ─── Image pre-loading ─────────────────────────────────────── */

/**
 * Pre-fetches an image URL and converts it to a base64 data URI.
 * Called once on module load so the data is available synchronously
 * when print() fires.
 */
function urlToDataUri(src: string): Promise<string> {
  return fetch(src)
    .then((res) => res.blob())
    .then((blob) => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    })
    .catch(() => src); // fallback to raw URL if fetch fails
}

// Eagerly pre-load logo into base64 data URI
let logoDataUri = '';

const logoUrl = new URL('@/assets/logo.png', import.meta.url).href;

// Kick off async pre-load; assign synchronously so the cache is warm
urlToDataUri(logoUrl).then((uri) => { logoDataUri = uri; });

/* ─── Dynamic QR code generation ───────────────────────────── */

/**
 * Generates a Google Review QR code data URI from the configured settings.
 * Returns an empty string if QR is disabled or URL is empty.
 */
let reviewQrDataUri = '';
let lastReviewUrl = '';
let lastReviewEnabled = false;

async function generateReviewQr(): Promise<void> {
  const settings = getPrintSettings();
  const url = settings.googleReviewUrl?.trim();
  const enabled = settings.enableGoogleReviewQr;

  // Skip if nothing changed
  if (url === lastReviewUrl && enabled === lastReviewEnabled && reviewQrDataUri) return;

  lastReviewUrl = url ?? '';
  lastReviewEnabled = enabled;

  if (!enabled || !url) {
    reviewQrDataUri = '';
    return;
  }

  try {
    reviewQrDataUri = await QRCode.toDataURL(url, {
      width: 512,
      margin: 4,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
  } catch {
    reviewQrDataUri = '';
  }
}

// Pre-generate on module load with current settings
generateReviewQr();

/* ─── Render helpers ────────────────────────────────────────── */

import { getPaymentMethodLabel } from '@/lib/payment-methods'

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

function itemsToHtml(items: InvoiceData['items']): string {
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

/* ─── Invoice HTML ──────────────────────────────────────────── */

function renderInvoiceHtml(invoice: InvoiceData): string {
  const hasDiscount = (invoice.discount ?? 0) > 0;
  const hasPaymentBreakdown = invoice.paymentBreakdown && invoice.paymentBreakdown.length > 0;
  const showLogo = getPrintSettings().showLogo;
  const imgLogo = logoDataUri || logoUrl;
  const imgReview = reviewQrDataUri;
  const paperSize = getPrintSettings().paperSize;
  const pageSize = paperSize === 'A4' ? '210mm 297mm' : `${paperSize} auto`;
  const bodyWidth = paperSize === 'A4' ? '190mm' : paperSize;
  const phone = escapeHtml(getPrintSettings().phone);
  const pan = escapeHtml(getPrintSettings().pan);

  const reviewSection = imgReview
    ? `
    <div style="font-size:14px;font-weight:700;margin-bottom:1mm;letter-spacing:1px">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
    <div style="font-size:12px;font-weight:600;margin-bottom:0.5mm">Enjoyed your visit?</div>
    <div style="font-size:11px;font-weight:500;margin-bottom:2mm;line-height:1.4">Please scan the QR code below to leave us a Google Review.</div>
    <div style="padding:1.5mm">
      <img src="${imgReview}" alt="Google Review QR" style="height:35mm;width:35mm;margin:0 auto;image-rendering:crisp-edges;background:#fff" />
    </div>
    <div style="font-size:11px;font-weight:500;margin-top:1mm;line-height:1.5">Thank you for supporting Highlands Cafe &amp; Motel Inn.</div>`
    : `<div style="font-size:12px;font-weight:500;margin-bottom:2mm">Thank You For Visiting!</div>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title>
<style>
  @page { size: ${pageSize}; margin: 0; }
  body { margin:0; padding:4mm 3mm; width:${bodyWidth}; max-width:${bodyWidth}; font-family:system-ui,'Segoe UI',Arial,sans-serif; font-size:12px; line-height:1.4; font-variant-numeric:tabular-nums; color:#000; background:#fff; }
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
  @media print { body { margin:0; padding:4mm 3mm; } }
</style></head>
<body>
  <div class="center">
    ${showLogo ? `<img src="${imgLogo}" alt="Logo" style="height:18mm;margin:0 auto 2mm" />` : ''}
    <div style="font-size:18px;font-weight:700;letter-spacing:0.5px">Highlands Cafe &amp; Motel Inn</div>
    <div style="font-size:12px;font-weight:500;margin-top:1mm">Premium Stays &bull; Great Coffee</div>
    <div style="font-size:11px;font-weight:500;margin-top:1.5mm;line-height:1.5">Birendranagar-8, Khajura<br />Surkhet, Nepal<br />Phone: ${phone}<br />PAN: ${pan}</div>
  </div>
  <div class="divider"></div>
  <div style="margin-bottom:2.5mm">
    <div style="font-weight:600;font-size:13px">Invoice #${escapeHtml(invoice.invoiceNumber)}</div>
    <div class="row" style="font-size:12px;font-weight:500;margin-top:0.5mm"><span>Date : ${escapeHtml(invoice.date)}</span><span>Time : ${escapeHtml(invoice.time)}</span></div>
  </div>
  <div class="divider"></div>
  <div class="row" style="font-weight:600;font-size:12px;border-bottom:1px dashed #000;padding-bottom:1.5mm;margin-bottom:1.5mm">
    <span style="flex:1">Item</span><span style="width:12mm;text-align:right">Qty</span><span style="width:18mm;text-align:right">Amount</span>
  </div>
  ${itemsToHtml(invoice.items)}
  <div class="divider"></div>
  ${hasPaymentBreakdown ? `
  <div style="margin-bottom:1.2mm">
    <div style="font-weight:600;font-size:12px;margin-bottom:0.8mm">Payment</div>
    ${(invoice.paymentBreakdown ?? []).map(p => {
      const label = getPaymentMethodLabel(p.method);
      const hasPmtDiscount = (p.discount ?? 0) > 0;
      return `<div class="row" style="font-size:12px;font-weight:500;margin-bottom:0.5mm">
        <span>${escapeHtml(label)}</span>
        <span>${hasPmtDiscount ? `<span style="color:#c00;font-size:11px;font-weight:600">-${fmt(p.discount)} </span>` : ''}${fmt(p.amount)}</span>
      </div>`;
    }).join('')}
  </div>
  <div class="divider"></div>` : ''}
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${fmt(invoice.subtotal)}</span></div>
    ${hasDiscount ? `<div class="row"><span>Discount</span><span style="color:#c00">-${fmt(invoice.discount ?? 0)}</span></div>` : ''}
    <div class="total-line"><span>TOTAL</span><span>${fmt(invoice.total)}</span></div>
  </div>
  <div class="divider"></div>
  <div class="center" style="margin-top:2.5mm">
    ${reviewSection}
    <div style="font-size:11px;font-weight:500;margin-top:${imgReview ? '2mm' : '1mm'};line-height:1.5">highlandscafemotelinn.com</div>
  </div>
</body>
</html>`;
}

/* ─── Print function (iframe-only for reliable same-origin assets) ──── */

function printViaIframe(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '80mm';
  iframe.style.height = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    // Last resort: try window.print fallback
    const pw = window.open('', '_blank', 'width=400,height=600');
    if (pw) {
      pw.document.open();
      pw.document.write(html);
      pw.document.close();
      pw.focus();
      setTimeout(() => pw.print(), 300);
    }
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Wait for images to decode before printing
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 400);

  // Clean up after print dialog closes
  setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }, 2000);
}

/* ─── Public API ────────────────────────────────────────────── */

export const printService = {
  /**
   * Print an invoice receipt.
   * Generates a fresh Google Review QR code if settings have changed,
   * then renders and prints the receipt via an iframe.
   */
  async printInvoice(invoice: InvoiceData): Promise<void> {
    // Ensure the QR is up-to-date before rendering
    await generateReviewQr();
    printViaIframe(renderInvoiceHtml(invoice));
  },
};
