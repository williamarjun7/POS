/**
 * PrintService
 * ─────────────
 * Encapsulates all printing logic for invoices and KOTs.
 *
 * Architecture (SINGLE SOURCE OF TRUTH):
 *   - Invoice HTML → renderInvoiceHtml() from InvoiceTemplate.tsx
 *   - KOT HTML      → renderKotHtml() from KotTemplate.tsx
 *   - No duplicate templates exist in this file.
 *
 * Usage:
 *   import { printService } from '@/lib/services/print-service';
 *
 *   // Print customer invoice
 *   await printService.printInvoice(invoiceData);
 *
 *   // Print Bill Preview (uses the same InvoiceTemplate)
 *   printService.printBillPreview(invoiceData);
 */

import { renderInvoiceHtml } from '@/components/printing/InvoiceTemplate';
import type { InvoiceData, InvoiceRenderOptions } from '@/components/printing/InvoiceTemplate';
import type { KotData } from '@/components/printing/KotTemplate';
import { renderKotHtml } from '@/components/printing/KotTemplate';
import { getPrintSettings } from '@/lib/services/print-settings';
import { isElectron, getElectronAPI } from '@/lib/detect-electron';
import QRCode from 'qrcode';

/* ─── Runtime Logging ───────────────────────────────────────── */

const PRINT_LOG = '[PRINT]';

function logPrintRequest(type: string, detail: string): void {
  console.log(`${PRINT_LOG} REQUEST type=${type} ${detail}`);
}

function logPrintSuccess(type: string, detail: string): void {
  console.log(`${PRINT_LOG} SUCCESS type=${type} ${detail}`);
}

function logPrintWarning(type: string, detail: string): void {
  console.warn(`${PRINT_LOG} WARNING type=${type} ${detail}`);
}

function logPrintError(type: string, detail: string, error?: unknown): void {
  console.error(`${PRINT_LOG} ERROR type=${type} ${detail}`, error ?? '');
}

/* ─── Image pre-loading ─────────────────────────────────────── */

/**
 * Pre-fetches an image URL and converts it to a base64 data URI.
 * Called once on module load so the data is available synchronously
 * when print() fires.
 */
function urlToDataUri(src: string): Promise<string> {
  if (src.startsWith('data:')) return Promise.resolve(src);

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
    .catch(() => src);
}

// Eagerly pre-load logo into base64 data URI
let logoDataUri = '';

const logoUrl = new URL('@/assets/logo.png', import.meta.url).href;

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

function getActiveQrCodes(): Array<{ dataUri: string; label: string }> {
  const codes: Array<{ dataUri: string; label: string }> = [];
  if (qrCaches.googleReview.dataUri) codes.push({ dataUri: qrCaches.googleReview.dataUri, label: 'Google Review' });
  if (qrCaches.instagram.dataUri) codes.push({ dataUri: qrCaches.instagram.dataUri, label: 'Follow Instagram' });
  if (qrCaches.tiktok.dataUri) codes.push({ dataUri: qrCaches.tiktok.dataUri, label: 'Follow TikTok' });
  return codes;
}

// Pre-generate on module load
generateAllQrs();

/* ─── Test Data Builders ────────────────────────────────────── */

function buildTestInvoiceData(): InvoiceData {
  const now = new Date();
  return {
    invoiceNumber: 'TEST-001',
    date: now.toLocaleDateString('en-GB'),
    time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }),
    items: [
      { name: 'Test Item 1', quantity: 1, unitPrice: 100 },
      { name: 'Test Item 2', quantity: 2, unitPrice: 100 },
    ],
    subtotal: 300,
    discount: 50,
    total: 250,
  };
}

function buildTestKotData(): KotData {
  const now = new Date();
  return {
    orderNumber: 'TEST-001',
    tableOrRoom: 'Table 99',
    date: now.toLocaleDateString('en-GB'),
    time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }),
    items: [
      { name: 'Chicken Mo:Mo', quantity: 2, modifiers: ['Steam', 'Extra Spicy'] },
      { name: 'Veg Pizza', quantity: 1, notes: 'No onion please' },
      { name: 'French Fries', quantity: 3, addons: ['Extra Cheese'] },
    ],
  };
}

/* ─── Build render options from settings ────────────────────── */

function buildInvoiceRenderOptions(overrides?: Partial<InvoiceRenderOptions>): InvoiceRenderOptions {
  const s = getPrintSettings();
  return {
    paperSize: s.paperSize,
    showLogo: s.showLogo,
    phone: s.phone,
    pan: s.pan,
    logoDataUri: logoDataUri || undefined,
    qrCodes: getActiveQrCodes().length > 0 ? getActiveQrCodes() : undefined,
    isPreview: false,
    isTest: false,
    ...overrides,
  };
}

/* ─── Retry wrapper ──────────────────────────────────────────── */

async function printWithRetry(
  fn: () => Promise<void> | void,
  maxRetries = 3,
  baseDelayMs = 600,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fn();
      return;
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = baseDelayMs * attempt;
        await new Promise(r => setTimeout(r, delay));
      } else {
        logPrintError('retry', 'All retries exhausted', err);
      }
    }
  }
}

function fireAndForget(fn: () => Promise<void> | void): void {
  printWithRetry(fn);
}

/* ─── Document Routing ─────────────────────────────────────── */

export type PrintDocumentType = 'invoice' | 'kot' | 'bill_preview' | 'test_receipt' | 'test_kot'

/**
 * Route a document to the appropriate printer target.
 *
 * Routing rules:
 *   - 'kot' / 'test_kot'                → kitchen printer (TCP/IP network)
 *   - 'invoice' / 'bill_preview' / 'test_receipt' → receipt printer (USB)
 *
 * @param html - The fully rendered HTML document to print
 * @param type - The type of document being printed
 * @param data - Optional structured data for native ESC/POS printing
 */
export async function routePrintDocument(
  html: string,
  type: PrintDocumentType,
  data?: InvoiceData | KotData,
): Promise<void> {
  const targetPrinter = type === 'kot' || type === 'test_kot' ? 'kitchen' : 'receipt';
  logPrintRequest(type, `Routing → ${targetPrinter} printer`);

  const escposPaperSize = (paper: string): '58mm' | '80mm' =>
    paper === 'A4' ? '80mm' : paper as '58mm' | '80mm';

  // ── Electron native printing ──────────────────────────────
  if (isElectron()) {
    try {
      const api = getElectronAPI();
      const s = getPrintSettings();
      const escposPaper = escposPaperSize(s.paperSize);

      switch (type) {
        case 'test_receipt': {
          logPrintRequest('test_receipt',
            `Test Receipt → Invoice Printer (USB) ` +
            `template=InvoiceTemplate builder=buildTestReceipt() ` +
            `paperSize=${escposPaper} (same printer as invoice)`);
          const now = new Date();
          await api.printSubmitTest('receipt', undefined, {
            businessName: 'Highlands Cafe & Motel Inn',
            address: ['Birendranagar-8, Khajura', 'Surkhet, Nepal'],
            phone: s.phone,
            pan: s.pan,
            paperSize: escposPaper,
            date: now.toLocaleDateString('en-GB'),
            time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }),
          });
          logPrintSuccess('test_receipt',
            `Test Receipt → buildTestReceipt() → ` +
            `Printer: Receipt Printer (USB) → Transport: USB → Result: Queued successfully`);
          return;
        }

        case 'test_kot': {
          logPrintRequest('test_kot',
            `Test KOT → Kitchen Printer (TCP) ` +
            `template=KotTemplate builder=buildTestKot() ` +
            `paperSize=${escposPaper} (separate printer from invoice)`);
          const now = new Date();
          await api.printSubmitTest('kot', undefined, {
            businessName: 'Highlands Cafe & Motel Inn',
            address: ['Birendranagar-8, Khajura', 'Surkhet, Nepal'],
            phone: s.phone,
            pan: s.pan,
            paperSize: escposPaper,
            date: now.toLocaleDateString('en-GB'),
            time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }),
          });
          logPrintSuccess('test_kot',
            `Test KOT → buildTestKot() → ` +
            `Printer: Kitchen Printer (TCP) → Transport: TCP → Result: Queued successfully`);
          return;
        }

        case 'invoice': {
          const inv = data as InvoiceData;
          if (!inv) break;
          logPrintRequest('invoice',
            `Invoice #${inv.invoiceNumber} → Invoice Printer (USB) ` +
            `template=InvoiceTemplate builder=buildInvoiceReceipt() ` +
            `showLogo=${s.showLogo} paperSize=${escposPaper}`);
          await api.printSubmitInvoice({
            businessName: 'Highlands Cafe & Motel Inn',
            businessAddress: ['Birendranagar-8, Khajura', 'Surkhet, Nepal'],
            phone: s.phone,
            pan: s.pan,
            invoiceNumber: inv.invoiceNumber,
            date: inv.date,
            time: inv.time,
            cashier: inv.cashierName,
            table: inv.tableOrRoom,
            items: inv.items,
            subtotal: inv.subtotal,
            discount: inv.discount,
            total: inv.total,
            paymentMethod: inv.paymentBreakdown?.[0]?.method,
            paymentBreakdown: inv.paymentBreakdown,
            showLogo: s.showLogo,
            paperSize: escposPaper,
          });
          logPrintSuccess('invoice',
            `Invoice #${inv.invoiceNumber} → buildInvoiceReceipt() → ` +
            `Printer: Receipt Printer (USB) → Transport: USB → Result: Queued successfully`);
          return;
        }

        case 'bill_preview': {
          const inv = data as InvoiceData;
          if (!inv) break;
          logPrintRequest('bill_preview',
            `Preview #${inv.invoiceNumber} → Invoice Printer (USB) ` +
            `template=InvoiceTemplate builder=buildInvoiceReceipt() ` +
            `isPreview=true showLogo=${s.showLogo} paperSize=${escposPaper} ` +
            `(same routing & settings as invoice)`);
          await api.printSubmitBillPreview(inv.invoiceNumber, {
            businessName: 'Highlands Cafe & Motel Inn',
            businessAddress: ['Birendranagar-8, Khajura', 'Surkhet, Nepal'],
            phone: s.phone,
            pan: s.pan,
            invoiceNumber: inv.invoiceNumber,
            date: inv.date,
            time: inv.time,
            cashier: inv.cashierName,
            table: inv.tableOrRoom,
            items: inv.items,
            subtotal: inv.subtotal,
            discount: inv.discount,
            total: inv.total,
            showLogo: s.showLogo, // Same setting as invoice
            paperSize: escposPaper,
            isPreview: true, // Only intentional difference: preview label
          });
          logPrintSuccess('bill_preview',
            `Preview #${inv.invoiceNumber} → buildInvoiceReceipt(isPreview=true) → ` +
            `Printer: Receipt Printer (USB) → Transport: USB → Result: Queued successfully`);
          return;
        }

        case 'kot': {
          const kot = data as KotData;
          if (!kot) break;
          logPrintRequest('kot',
            `KOT ${kot.orderNumber} → Kitchen Printer (TCP) ` +
            `template=KotTemplate builder=buildKitchenKot() ` +
            `paperSize=${escposPaper}`);
          await api.printSubmitKot({
            businessName: 'Highlands Cafe & Motel Inn',
            orderNumber: kot.orderNumber,
            tableOrRoom: kot.tableOrRoom,
            date: kot.date,
            time: kot.time,
            customerName: kot.customerName,
            waiterName: kot.waiterName,
            items: kot.items,
            paperSize: escposPaper,
            showCustomer: s.showCustomerOnKot ?? false,
            showStaff: s.showStaffOnKot ?? false,
          }, kot.orderNumber);
          logPrintSuccess('kot',
            `KOT ${kot.orderNumber} → buildKitchenKot() → ` +
            `Printer: Kitchen Printer (TCP) → Transport: TCP → Result: Queued successfully`);
          return;
        }

        default:
          logPrintWarning(type, 'Unknown document type');
          break;
      }
    } catch (err) {
      logPrintWarning(type, 'Electron print failed, falling back to iframe', err);
    }
  }

  // ── Browser / iframe fallback ─────────────────────────────
  logPrintRequest(type, `Falling back to iframe (browser print dialog)`);
  printViaIframe(html);
}

/* ─── Print function (iframe-only) ──────────────────────────── */

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

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 400);

  setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }, 2000);
}

/* ─── Public API ────────────────────────────────────────────── */

export const printService = {
  /**
   * Print an invoice receipt.
   * Uses the SINGLE shared renderInvoiceHtml() from InvoiceTemplate.tsx.
   */
  async printInvoice(invoice: InvoiceData): Promise<void> {
    logPrintRequest('invoice', `Invoice #${invoice.invoiceNumber} — generating HTML via renderInvoiceHtml()`);
    await generateAllQrs();
    const options = buildInvoiceRenderOptions();
    const html = renderInvoiceHtml(invoice, options);
    logPrintRequest('invoice', `HTML generated (${html.length} chars), submitting to routePrintDocument()`);
    await printWithRetry(() => { routePrintDocument(html, 'invoice', invoice); });
  },

  /**
   * Print a Kitchen Order Ticket (KOT).
   * Fire-and-forget — never blocks the caller.
   * Uses the SINGLE shared renderKotHtml() from KotTemplate.tsx.
   */
  printKot(kot: KotData): void {
    const settings = getPrintSettings();
    const copies = Math.max(1, settings.kotPrintCopies);
    logPrintRequest('kot', `KOT ${kot.orderNumber} — ${copies} copy(ies) via renderKotHtml()`);

    fireAndForget(async () => {
      for (let i = 0; i < copies; i++) {
        const html = renderKotHtml(kot, settings.paperSize, settings.showCustomerOnKot, settings.showStaffOnKot);
        logPrintRequest('kot', `Copy ${i + 1}/${copies} — HTML (${html.length} chars)`);
        if (i > 0) await new Promise(r => setTimeout(r, 800));
        routePrintDocument(html, 'kot', kot);
      }
    });
  },

  /**
   * Print a test receipt to verify printer configuration.
   * Uses the SINGLE shared renderInvoiceHtml() with isTest=true.
   */
  async printTestReceipt(): Promise<void> {
    logPrintRequest('test_receipt', 'Building test invoice data and rendering via renderInvoiceHtml(isTest=true)');
    await generateAllQrs();
    const testData = buildTestInvoiceData();
    const options = buildInvoiceRenderOptions({ isPreview: false, isTest: true });
    const html = renderInvoiceHtml(testData, options);
    logPrintRequest('test_receipt', `HTML generated (${html.length} chars) — submitting to routePrintDocument()`);
    await printWithRetry(() => { routePrintDocument(html, 'test_receipt'); });
  },

  /**
   * Print a test KOT to verify kitchen printer configuration.
   * Uses the SINGLE shared renderKotHtml().
   */
  async printTestKot(): Promise<void> {
    const settings = getPrintSettings();
    const testData = buildTestKotData();
    logPrintRequest('test_kot', 'Building test KOT data and rendering via renderKotHtml()');
    const html = renderKotHtml(testData, settings.paperSize, false, false);
    logPrintRequest('test_kot', `HTML generated (${html.length} chars) — submitting to routePrintDocument()`);
    await printWithRetry(() => { routePrintDocument(html, 'test_kot'); });
  },

  /**
   * Print a Bill Preview / Proforma Bill.
   * Fire-and-forget — never blocks the caller.
   * Uses the SINGLE shared renderInvoiceHtml() with isPreview=true.
   * Clearly marked as "BILL PREVIEW" on both screen and ESC/POS receipt.
   * Does NOT include QR codes, thank-you messages, or marketing text.
   */
  printBillPreview(invoice: InvoiceData): void {
    logPrintRequest('bill_preview', `Preview #${invoice.invoiceNumber} — rendering via renderInvoiceHtml(isPreview=true)`);
    const options = buildInvoiceRenderOptions({
      isPreview: true,
      isTest: false,
      qrCodes: [], // No QR codes on preview
    });
    const html = renderInvoiceHtml(invoice, options);
    logPrintRequest('bill_preview', `HTML generated (${html.length} chars) — submitting to routePrintDocument()`);
    fireAndForget(() => { routePrintDocument(html, 'bill_preview', invoice); });
  },
};
