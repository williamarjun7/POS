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
import type { KotData } from '@/components/printing/KotTemplate';
import { renderKotHtml } from '@/components/printing/KotTemplate';
import { getPrintSettings } from '@/lib/services/print-settings';
import { isElectron, getElectronAPI } from '@/lib/detect-electron';
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

/** Cached state for QR generation */
interface QrCache {
  dataUri: string;
  lastUrl: string;
  lastEnabled: boolean;
}

const qrCaches: Record<string, QrCache> = {
  googleReview: { dataUri: '', lastUrl: '', lastEnabled: false },
  instagram: { dataUri: '', lastUrl: '', lastEnabled: false },
  tiktok: { dataUri: '', lastUrl: '', lastEnabled: false },
};

async function generateQr(
  cache: QrCache,
  url: string | undefined,
  enabled: boolean,
): Promise<void> {
  const trimmed = url?.trim() ?? '';
  if (trimmed === cache.lastUrl && enabled === cache.lastEnabled && cache.dataUri) return;

  cache.lastUrl = trimmed;
  cache.lastEnabled = enabled;

  if (!enabled || !trimmed) {
    cache.dataUri = '';
    return;
  }

  try {
    cache.dataUri = await QRCode.toDataURL(trimmed, {
      width: 512,
      margin: 4,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
  } catch {
    cache.dataUri = '';
  }
}

async function generateAllQrs(): Promise<void> {
  const s = getPrintSettings();
  await Promise.all([
    generateQr(qrCaches.googleReview, s.googleReviewUrl, s.enableGoogleReviewQr),
    generateQr(qrCaches.instagram, s.instagramUrl, s.enableInstagramQr),
    generateQr(qrCaches.tiktok, s.tiktokUrl, s.enableTiktokQr),
  ]);
}

// Pre-generate on module load
generateAllQrs();

/* ─── Render helpers ────────────────────────────────────────── */

import { getPaymentMethodLabel } from '@/lib/payment-methods'

const fmt = (amount: number) =>
  amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
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

/* ─── QR Footer HTML ───────────────────────────────────────── */

function renderQrFooterHtml(paperSize: string): string {
  const activeQrs: Array<{ dataUri: string; label: string }> = [];

  if (qrCaches.googleReview.dataUri) {
    activeQrs.push({ dataUri: qrCaches.googleReview.dataUri, label: 'Google Review' });
  }
  if (qrCaches.instagram.dataUri) {
    activeQrs.push({ dataUri: qrCaches.instagram.dataUri, label: 'Follow Instagram' });
  }
  if (qrCaches.tiktok.dataUri) {
    activeQrs.push({ dataUri: qrCaches.tiktok.dataUri, label: 'Follow TikTok' });
  }

  if (activeQrs.length === 0) return '';

  const isNarrow = paperSize === '58mm';

  if (isNarrow) {
    // Vertical stacking for 58mm
    const qrSize = '36mm';
    return activeQrs
      .map(
        (qr) => `
        <div style="margin-bottom:2mm">
          <img src="${qr.dataUri}" alt="${escapeHtml(qr.label)}" style="height:${qrSize};width:${qrSize};margin:0 auto;image-rendering:crisp-edges;background:#fff" />
          <div style="font-size:10px;font-weight:600;margin-top:0.3mm">${escapeHtml(qr.label)}</div>
        </div>`,
      )
      .join('');
  }

  // Horizontal layout for 80mm / A4
  const qrCount = activeQrs.length;
  const qrSize = qrCount === 3 ? '22mm' : qrCount === 2 ? '30mm' : '40mm';
  const labelSize = qrCount === 3 ? '9px' : qrCount === 2 ? '10px' : '11px';

  return `
  <div style="display:flex;justify-content:center;gap:1.5mm;flex-wrap:wrap">
    ${activeQrs
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

/* ─── Invoice HTML ──────────────────────────────────────────── */

function renderInvoiceHtml(invoice: InvoiceData): string {
  const hasDiscount = (invoice.discount ?? 0) > 0;
  const hasPaymentBreakdown = invoice.paymentBreakdown && invoice.paymentBreakdown.length > 0;
  const showLogo = getPrintSettings().showLogo;
  const imgLogo = logoDataUri || logoUrl;
  const paperSize = getPrintSettings().paperSize;
  const pageSize = paperSize === 'A4' ? '210mm 297mm' : `${paperSize} auto`;
  const bodyWidth = paperSize === 'A4' ? '190mm' : paperSize;
  const phone = escapeHtml(getPrintSettings().phone);
  const pan = escapeHtml(getPrintSettings().pan);
  const activeQrCount = [
    qrCaches.googleReview.dataUri,
    qrCaches.instagram.dataUri,
    qrCaches.tiktok.dataUri,
  ].filter(Boolean).length;

  const qrFooterSection = renderQrFooterHtml(paperSize);

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
  .qr-grid { display:flex; justify-content:center; gap:1.5mm; flex-wrap:wrap; }
  .qr-grid .qr-cell { text-align:center; }
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
    <!-- Thank you message -->
    <div style="font-size:12px;font-weight:700;letter-spacing:0.5px;line-height:1.5;margin-bottom:0.5mm">
      Thank You for Visiting!<br />We Hope to See You Again
    </div>
    <div class="divider" style="margin:2mm 0"></div>
    ${activeQrCount > 0 ? `
    <div style="font-size:11px;font-weight:600;margin-bottom:1.5mm">Connect With Us</div>
    ${qrFooterSection}
    <div style="font-size:9px;font-weight:500;margin-top:1.5mm;line-height:1.4;color:#555">
      Leave us a review and follow us for the latest updates!
    </div>` : `
    <div style="font-size:11px;font-weight:500;margin-bottom:2mm">Thank you for your visit!</div>`}
    <div style="font-size:11px;font-weight:500;margin-top:1.5mm;line-height:1.5">highlandscafemotelinn.com</div>
  </div>
</body>
</html>`;
}

/* ─── Test Print HTML ────────────────────────────────────────── */

function renderTestReceiptHtml(): string {
  const paperSize = getPrintSettings().paperSize;
  const pageSize = paperSize === 'A4' ? '210mm 297mm' : `${paperSize} auto`;
  const bodyWidth = paperSize === 'A4' ? '190mm' : paperSize;
  // Generate fresh QRs for test print
  const qrSection = renderQrFooterHtml(paperSize);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Test Receipt</title>
<style>
  @page { size: ${pageSize}; margin: 0; }
  body { margin:0; padding:4mm 3mm; width:${bodyWidth}; max-width:${bodyWidth}; font-family:system-ui,'Segoe UI',Arial,sans-serif; font-size:12px; line-height:1.4; font-variant-numeric:tabular-nums; color:#000; background:#fff; }
  .center { text-align:center; }
  .divider { border-top:1px dashed #000; margin:2.5mm 0; }
  .row { display:flex; justify-content:space-between; }
  .test-header { font-size:14px; font-weight:800; letter-spacing:2px; }
  @media print { body { margin:0; padding:4mm 3mm; } }
</style></head>
<body>
  <div class="center">
    <div style="font-size:16px;font-weight:700;letter-spacing:0.5px">HIGHLANDS CAFE &amp; MOTEL INN</div>
    <div class="test-header" style="margin-top:1mm">TEST RECEIPT</div>
    <div style="font-size:10px;font-weight:500;margin-top:0.5mm;color:#c00">*** This is a test print ***</div>
  </div>
  <div class="divider"></div>
  <div style="margin-bottom:2.5mm">
    <div style="font-weight:600;font-size:13px">Invoice #TEST-001</div>
    <div class="row" style="font-size:12px;font-weight:500;margin-top:0.5mm"><span>Date : ${new Date().toLocaleDateString('en-GB')}</span><span>Time : ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}</span></div>
  </div>
  <div class="divider"></div>
  <div class="row" style="font-weight:600;font-size:12px;border-bottom:1px dashed #000;padding-bottom:1.5mm;margin-bottom:1.5mm">
    <span style="flex:1">Item</span><span style="width:12mm;text-align:right">Qty</span><span style="width:18mm;text-align:right">Amount</span>
  </div>
  <div class="item" style="margin-bottom:1.2mm">
    <div class="row"><span style="flex:1;font-weight:500;padding-right:2mm;font-size:12px">Test Item 1</span><span style="width:12mm;text-align:right;font-size:12px;font-weight:500">1</span><span style="width:18mm;text-align:right;font-weight:500;font-size:12px">100.00</span></div>
  </div>
  <div class="item" style="margin-bottom:1.2mm">
    <div class="row"><span style="flex:1;font-weight:500;padding-right:2mm;font-size:12px">Test Item 2</span><span style="width:12mm;text-align:right;font-size:12px;font-weight:500">2</span><span style="width:18mm;text-align:right;font-weight:500;font-size:12px">200.00</span></div>
  </div>
  <div class="divider"></div>
  <div class="totals" style="margin-top:2mm">
    <div class="row" style="font-size:12px;font-weight:500;margin-bottom:0.5mm"><span>Subtotal</span><span>300.00</span></div>
    <div class="row" style="font-size:12px;font-weight:500;margin-bottom:0.5mm"><span>Discount</span><span style="color:#c00">-50.00</span></div>
    <div style="border-top:1.5px solid #000;margin-top:1.5mm;padding-top:1.5mm;display:flex;justify-content:space-between;font-weight:800;font-size:18px"><span>TOTAL</span><span>250.00</span></div>
  </div>
  <div class="divider"></div>
  <div class="center" style="margin-top:2.5mm">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.5px;line-height:1.5;margin-bottom:0.5mm">
      Thank You for Visiting!<br />We Hope to See You Again
    </div>
    ${qrSection ? `<div class="divider" style="margin:2mm 0"></div><div style="font-size:11px;font-weight:600;margin-bottom:1.5mm">Connect With Us</div>${qrSection}<div style="font-size:9px;font-weight:500;margin-top:1.5mm;line-height:1.4;color:#555">Leave us a review and follow us for the latest updates!</div>` : ''}
    <div style="font-size:11px;font-weight:500;margin-top:1.5mm;line-height:1.5">highlandscafemotelinn.com</div>
  </div>
</body>
</html>`;
}

function renderTestKotHtml(): string {
  const settings = getPrintSettings();

  const testKotData: KotData = {
    orderNumber: 'TEST-001',
    tableOrRoom: 'Table 99',
    date: new Date().toLocaleDateString('en-GB'),
    time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }),
    items: [
      {
        name: 'Chicken Mo:Mo',
        quantity: 2,
        modifiers: ['Steam', 'Extra Spicy'],
      },
      {
        name: 'Veg Pizza',
        quantity: 1,
        notes: 'No onion please',
      },
      {
        name: 'French Fries',
        quantity: 3,
        addons: ['Extra Cheese'],
      },
    ],
  };

  return renderKotHtml(testKotData, settings.paperSize, settings.showCustomerOnKot, settings.showStaffOnKot);
}

/* ─── Retry wrapper ──────────────────────────────────────────── */

/**
 * Execute a print function with up to `maxRetries` attempts.
 * Each retry waits `baseDelayMs` before retrying.
 * Failures are swallowed after the final attempt — printing must
 * never interrupt business operations.
 */
async function printWithRetry(
  fn: () => Promise<void> | void,
  maxRetries = 3,
  baseDelayMs = 600,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fn();
      return; // Success — exit immediately
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = baseDelayMs * attempt; // Linear backoff: 600, 1200, 1800
        await new Promise(r => setTimeout(r, delay));
      } else {
        // Final attempt failed — silently swallow
        if (import.meta.env.DEV) {
          console.warn('[PRINT] All retries exhausted:', err instanceof Error ? err.message : String(err));
        }
      }
    }
  }
}

/**
 * Fire-and-forget print helper.
 * Wraps printWithRetry in a void promise so the caller never awaits.
 * Used for background KOT printing where the cashier must not wait.
 */
function fireAndForget(
  fn: () => Promise<void> | void,
): void {
  // All errors are already swallowed inside printWithRetry.
  printWithRetry(fn);
}

/* ─── Document Routing ─────────────────────────────────────── */

/**
 * Document types supported by the print routing system.
 */
export type PrintDocumentType = 'invoice' | 'kot' | 'bill_preview' | 'test_receipt' | 'test_kot'

/**
 * Route a document to the appropriate printer target.
 * Currently routes:
 *   - 'kot' / 'test_kot' → kitchen printer (IP-based network printer)
 *   - 'invoice' / 'bill_preview' / 'test_receipt' → USB receipt printer
 *
 * In a browser environment, both targets ultimately call window.print().
 * The routing creates a logical separation so future native integrations
 * (e.g. Electron IPC, WebUSB, native TCP socket) can plug in here.
 *
 * @param html - The fully rendered HTML document to print
 * @param type - The type of document being printed
 */
export function routePrintDocument(html: string, type: PrintDocumentType): void {
  const targetPrinter = type === 'kot' || type === 'test_kot'
    ? 'kitchen'
    : 'receipt'

  if (import.meta.env.DEV) {
    console.log(`[PRINT] Routing ${type} → ${targetPrinter} printer`)
  }

  // ── Electron native printing ──────────────────────────────
  // When running as a desktop app, bypass the browser print dialog
  // and send directly to the printer manager via IPC.
  if (isElectron()) {
    try {
      getElectronAPI().printSubmit(type, html);
      return;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[PRINT] Electron print failed, falling back to iframe:', err);
      }
      // Fall through to iframe fallback
    }
  }

  // ── Browser fallback ─────────────────────────────────────
  // Both targets use the same iframe mechanism for now.
  printViaIframe(html)
}

/* ─── Print function (iframe-only for reliable same-origin assets) ──── */

function printViaIframe(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = getPrintSettings().paperSize === 'A4' ? '210mm' : getPrintSettings().paperSize;
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
   * Generates fresh QR codes if settings have changed,
   * then renders and prints the receipt via an iframe.
   */
  async printInvoice(invoice: InvoiceData): Promise<void> {
    // Ensure all QRs are up-to-date before rendering
    await generateAllQrs();
    const html = renderInvoiceHtml(invoice);
    await printWithRetry(() => { routePrintDocument(html, 'invoice'); });
  },

  /**
   * Print a Kitchen Order Ticket (KOT).
   * Fire-and-forget — never blocks the caller.
   * Renders and prints the KOT via an iframe.
   * Uses the SINGLE shared renderKotHtml as the source of truth.
   * Supports multiple copies as configured in print settings.
   */
  printKot(kot: KotData): void {
    const settings = getPrintSettings();
    const copies = Math.max(1, settings.kotPrintCopies);

    fireAndForget(async () => {
      for (let i = 0; i < copies; i++) {
        const html = renderKotHtml(kot, settings.paperSize, settings.showCustomerOnKot, settings.showStaffOnKot);
        // Small delay between copies to allow the print dialog to process
        if (i > 0) await new Promise(r => setTimeout(r, 800));
        routePrintDocument(html, 'kot');
      }
    });
  },

  /**
   * Print a test receipt to verify printer configuration.
   */
  async printTestReceipt(): Promise<void> {
    await generateAllQrs();
    const html = renderTestReceiptHtml();
    await printWithRetry(() => { routePrintDocument(html, 'test_receipt'); });
  },

  /**
   * Print a test KOT to verify kitchen printer configuration.
   */
  async printTestKot(): Promise<void> {
    const settings = getPrintSettings();
    const html = renderTestKotHtml();
    await printWithRetry(() => { routePrintDocument(html, 'test_kot'); });
  },

  /**
   * Print a Bill Preview / Proforma Bill.
   * Fire-and-forget — never blocks the caller.
   * Clearly marked as "BILL PREVIEW" to avoid confusion with the final paid invoice.
   * Does NOT create any database records, payment entries, or customer records.
   * Does NOT include QR codes, thank-you messages, or marketing text.
   */
  printBillPreview(invoice: InvoiceData): void {
    const paperSize = getPrintSettings().paperSize;
    const pageSize = paperSize === 'A4' ? '210mm 297mm' : `${paperSize} auto`;
    const bodyWidth = paperSize === 'A4' ? '190mm' : paperSize;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Bill Preview</title>
<style>
  @page { size: ${pageSize}; margin: 0; }
  body { margin:0; padding:4mm 3mm; width:${bodyWidth}; max-width:${bodyWidth}; font-family:system-ui,'Segoe UI',Arial,sans-serif; font-size:12px; line-height:1.4; font-variant-numeric:tabular-nums; color:#000; background:#fff; }
  .center { text-align:center; }
  .divider { border-top:1px dashed #000; margin:2.5mm 0; }
  .row { display:flex; justify-content:space-between; }
  .item { margin-bottom:1.2mm; }
  .item-row { display:flex; justify-content:space-between; align-items:baseline; }
  .item-name { flex:1; font-weight:500; padding-right:2mm; font-size:12px; }
  .item-qty { width:12mm; text-align:right; font-size:12px; font-weight:500; }
  .item-amount { width:18mm; text-align:right; font-weight:500; font-size:12px; }
  .note { font-style:italic; font-size:10px; padding-left:4mm; }
  .proforma-badge { font-size:11px; font-weight:700; color:#c00; letter-spacing:1px; border:1.5px solid #c00; display:inline-block; padding:1mm 3mm; margin:1mm 0; }
  @media print { body { margin:0; padding:4mm 3mm; } }
</style></head>
<body>
  <div class="center">
    <div style="font-size:16px;font-weight:700;letter-spacing:0.5px">HIGHLANDS CAFE &amp; MOTEL INN</div>
    <div style="font-size:11px;font-weight:500;margin-top:0.5mm">Birendranagar-8, Khajura &bull; Surkhet, Nepal</div>
    <div class="proforma-badge">BILL PREVIEW</div>
  </div>
  <div class="divider"></div>
  <div style="margin-bottom:2.5mm">
    <div class="row" style="font-weight:600;font-size:13px"><span>${escapeHtml(invoice.invoiceNumber)}</span><span>${escapeHtml(invoice.tableOrRoom || '')}</span></div>
    <div class="row" style="font-size:11px;font-weight:500;margin-top:0.5mm;color:#555"><span>${escapeHtml(invoice.date)}</span><span>${escapeHtml(invoice.time)}</span></div>
    ${invoice.cashierName ? `<div style="font-size:11px;font-weight:500;margin-top:0.3mm;color:#555">Cashier: ${escapeHtml(invoice.cashierName)}</div>` : ''}
  </div>
  <div class="divider"></div>
  <div class="row" style="font-weight:600;font-size:12px;border-bottom:1px dashed #000;padding-bottom:1.5mm;margin-bottom:1.5mm">
    <span style="flex:1">Item</span><span style="width:12mm;text-align:right">Qty</span><span style="width:18mm;text-align:right">Amount</span>
  </div>
  ${itemsToHtml(invoice.items)}
  <div class="divider"></div>
  <div style="margin-top:2mm">
    <div class="row" style="font-size:12px;font-weight:500;margin-bottom:0.5mm"><span>Subtotal</span><span>${fmt(invoice.subtotal)}</span></div>
    <div style="border-top:1.5px solid #000;margin-top:1.5mm;padding-top:1.5mm;display:flex;justify-content:space-between;font-weight:800;font-size:16px"><span>GRAND TOTAL</span><span>${fmt(invoice.total)}</span></div>
  </div>
  <div class="divider"></div>
  <div class="center" style="font-size:10px;font-weight:500;color:#c00">
    *** This is a BILL PREVIEW — Not a Final Invoice ***
  </div>
</body>
</html>`;

    fireAndForget(() => { routePrintDocument(html, 'bill_preview'); });
  },
};
