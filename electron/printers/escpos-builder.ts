/**
 * escpos-builder.ts
 * ─────────────────
 * Builds raw ESC/POS binary command sequences for thermal printers.
 *
 * Output: Buffer of ESC/POS commands ready to send via USB or TCP transport.
 * No HTML. No DOM. Pure binary commands for ZYWELL ZY-Q822 / EPSON-compatible printers.
 *
 * Reference: ESC/POS Application Programming Guide
 *   ESC = 0x1B
 *   GS  = 0x1D
 *   LF  = 0x0A
 *   CR  = 0x0D
 *   FF  = 0x0C (form feed / cut)
 */

export type EscposPaperSize = '58mm' | '80mm';

export interface EscposLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers?: string[];
  addons?: string[];
  notes?: string;
}

export interface EscposInvoiceData {
  businessName: string;
  businessAddress: string[];
  phone: string;
  pan: string;
  invoiceNumber: string;
  date: string;
  time: string;
  cashier?: string;
  table?: string;
  customer?: string;
  items: EscposLineItem[];
  subtotal: number;
  discount?: number;
  total: number;
  paymentMethod?: string;
  paymentBreakdown?: Array<{ method: string; amount: number; discount?: number }>;
  showLogo: boolean;
  paperSize: EscposPaperSize;
  /** When true, prints "BILL PREVIEW" marking instead of thank-you message */
  isPreview?: boolean;
}

export interface EscposKotData {
  businessName: string;
  orderNumber: string;
  tableOrRoom: string;
  date: string;
  time: string;
  customerName?: string;
  waiterName?: string;
  items: Array<{
    name: string;
    quantity: number;
    modifiers?: string[];
    addons?: string[];
    notes?: string;
  }>;
  paperSize: EscposPaperSize;
  showCustomer: boolean;
  showStaff: boolean;
}

// ─── ESC/POS Constants ────────────────────────────────

const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;
const FF = 0x0C;
const CR = 0x0D;

function cmd(...bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

// ─── Text Encoding ────────────────────────────────────

function encode(text: string): Buffer {
  // Use a simple 7-bit safe encoding; CP437 would be ideal but most
  // modern thermal printers handle UTF-8 reasonably well for basic ASCII.
  return Buffer.from(text, 'ascii');
}

function line(text = ''): Buffer {
  return Buffer.concat([encode(text), Buffer.from([LF])]);
}

function repeat(char: string, count: number): string {
  return char.repeat(Math.max(1, count));
}

// ─── Column width helpers ────────────────────────────

function getCols(paperSize: EscposPaperSize): number {
  return paperSize === '80mm' ? 48 : 32;
}

// ─── Public Builders ──────────────────────────────────

export class EscposBuilder {
  private buf: Buffer[] = [];

  // ── Initialization ────────────────────────────────

  /** Initialize printer */
  init(): this {
    this.buf.push(cmd(ESC, 0x40)); // ESC @ — Initialize printer
    return this;
  }

  /** Line feed (n lines) */
  feed(n = 1): this {
    for (let i = 0; i < n; i++) {
      this.buf.push(Buffer.from([LF]));
    }
    return this;
  }

  /** Carriage return */
  cr(): this {
    this.buf.push(Buffer.from([CR]));
    return this;
  }

  // ── Text formatting ───────────────────────────────

  /** Bold on / off */
  bold(on: boolean): this {
    this.buf.push(cmd(ESC, 0x45, on ? 1 : 0)); // ESC E n
    return this;
  }

  /** Underline on / off */
  underline(on: boolean): this {
    this.buf.push(cmd(ESC, 0x2D, on ? 1 : 0)); // ESC - n
    return this;
  }

  /** Font size: n = 1 (normal), 2 (double height), 3 (double width+height) */
  fontSize(n: 1 | 2 | 3): this {
    this.buf.push(cmd(GS, 0x21, n === 3 ? 0x33 : n === 2 ? 0x11 : 0x00)); // GS ! n
    return this;
  }

  /** Set character size (width, height) in dots */
  charSize(w: number, h: number): this {
    const n = ((w - 1) << 4) | (h - 1);
    this.buf.push(cmd(GS, 0x21, n));
    return this;
  }

  // ── Alignment ─────────────────────────────────────

  alignLeft(): this {
    this.buf.push(cmd(ESC, 0x61, 0x00)); // ESC a 0
    return this;
  }

  alignCenter(): this {
    this.buf.push(cmd(ESC, 0x61, 0x01)); // ESC a 1
    return this;
  }

  alignRight(): this {
    this.buf.push(cmd(ESC, 0x61, 0x02)); // ESC a 2
    return this;
  }

  // ── Text output ───────────────────────────────────

  writeln(text: string): this {
    this.buf.push(line(text));
    return this;
  }

  write(text: string): this {
    this.buf.push(encode(text));
    return this;
  }

  /** Print a centered line */
  center(text: string): this {
    this.alignCenter();
    this.buf.push(line(text));
    this.alignLeft();
    return this;
  }

  /** Print a divider line */
  divider(char = '─'): this {
    const cols = 48;
    this.buf.push(line(repeat(char, cols)));
    return this;
  }

  // ── Smart formatting ──────────────────────────────

  /** Two-column layout: left text + right text */
  twoCol(left: string, right: string, cols = 48): this {
    const leftMax = Math.floor(cols * 0.6);
    const rightMax = cols - leftMax;
    const truncatedLeft = left.length > leftMax ? left.slice(0, leftMax - 1) + '…' : left;
    const truncatedRight = right.length > rightMax ? right.slice(0, rightMax) : right;
    const padding = cols - truncatedLeft.length - truncatedRight.length;
    this.buf.push(line(truncatedLeft + ' '.repeat(Math.max(0, padding)) + truncatedRight));
    return this;
  }

  /** Three-column layout for items: name, qty, amount */
  itemRow(name: string, qty: number, amount: number, cols = 48): this {
    const nameMax = cols - 16; // reserve 16 chars for qty + amount
    const qtyStr = `${qty}`;
    const amtStr = `${amount.toFixed(2)}`;
    const truncatedName = name.length > nameMax ? name.slice(0, nameMax - 1) + '…' : name;
    const padding = cols - truncatedName.length - qtyStr.length - amtStr.length - 2;
    this.buf.push(line(`${truncatedName}${' '.repeat(Math.max(0, padding))} ${qtyStr} ${amtStr}`));
    return this;
  }

  /** Sub-line for modifiers, addons, notes */
  subLine(text: string, indent = 2): this {
    this.buf.push(line(' '.repeat(indent) + text));
    return this;
  }

  // ── Paper cut ─────────────────────────────────────

  /** Full cut */
  cut(): this {
    this.buf.push(cmd(GS, 0x56, 0x00)); // GS V 0
    return this;
  }

  /** Partial cut (one point left uncut) */
  cutPartial(): this {
    this.buf.push(cmd(GS, 0x56, 0x01)); // GS V 1
    return this;
  }

  /** Feed paper n lines and cut */
  feedAndCut(n = 3): this {
    this.buf.push(cmd(GS, 0x56, 0x42, n)); // GS V B n
    return this;
  }

  // ── Cash drawer ───────────────────────────────────

  /** Open cash drawer (pin 2) */
  openDrawer(): this {
    this.buf.push(cmd(ESC, 0x70, 0x00, 0x30, 0xFC)); // ESC p 0 48 252
    return this;
  }

  /** Open cash drawer (pin 5) */
  openDrawerPin5(): this {
    this.buf.push(cmd(ESC, 0x70, 0x01, 0x30, 0xFC)); // ESC p 1 48 252
    return this;
  }

  // ── Barcode / QR (advanced printers) ──────────────

  /** Print a QR code (if printer supports it) */
  qrCode(data: string, _size = 6): this {
    // Simplified — full QR via ESC/POS requires pL/pH calculation.
    // For production, use printer's native QR command set.
    this.buf.push(encode(`[QR: ${data}]`));
    this.buf.push(Buffer.from([LF]));
    return this;
  }

  // ── Build ─────────────────────────────────────────

  /** Get the final ESC/POS buffer */
  build(): Buffer {
    return Buffer.concat(this.buf);
  }
}

// ─── High-level templates ─────────────────────────────

/**
 * Build an invoice receipt as ESC/POS commands.
 * Returns raw buffer ready for USB/TCP transport.
 */
export function buildInvoiceReceipt(data: EscposInvoiceData): Buffer {
  const p = new EscposBuilder();
  const cols = getCols(data.paperSize);

  p.init();
  p.feed(1);

  // Header
  p.alignCenter();
  p.bold(true);
  p.charSize(2, 2);
  p.writeln(data.businessName);
  p.charSize(1, 1);
  p.bold(false);

  for (const addrLine of data.businessAddress) {
    p.writeln(addrLine);
  }
  if (data.phone) p.writeln(`Phone: ${data.phone}`);
  if (data.pan) p.writeln(`PAN: ${data.pan}`);

  p.divider('═');

  // Invoice info
  p.bold(true);
  p.writeln(`Invoice #${data.invoiceNumber}`);
  p.bold(false);
  p.twoCol(`Date: ${data.date}`, `Time: ${data.time}`, cols);
  if (data.cashier) p.writeln(`Cashier: ${data.cashier}`);
  if (data.table) p.writeln(`Table: ${data.table}`);
  if (data.customer) p.writeln(`Customer: ${data.customer}`);

  p.divider('─');

  // Column headers
  p.bold(true);
  const headerPad = cols - 10; // reserve for qty + amount
  p.writeln(`Item${' '.repeat(Math.max(0, headerPad - 4))} Qty  Amount`);
  p.bold(false);

  p.divider('─');

  // Items
  for (const item of data.items) {
    const lineTotal = item.unitPrice * item.quantity;
    p.itemRow(item.name, item.quantity, lineTotal, cols);

    for (const mod of item.modifiers ?? []) {
      p.subLine(`• ${mod}`);
    }
    for (const addon of item.addons ?? []) {
      p.subLine(`+ ${addon}`);
    }
    if (item.notes) {
      p.subLine(`Note: ${item.notes}`);
    }
  }

  p.divider('─');

  // Totals
  p.twoCol('Subtotal', `${data.subtotal.toFixed(2)}`, cols);
  if ((data.discount ?? 0) > 0) {
    p.twoCol('Discount', `-${data.discount!.toFixed(2)}`, cols);
  }
  p.feed(1);
  p.bold(true);
  p.charSize(2, 2);
  p.twoCol('TOTAL', `${data.total.toFixed(2)}`, cols);
  p.charSize(1, 1);
  p.bold(false);

  p.divider('═');

  // Payment
  if (data.paymentMethod) {
    p.writeln(`Payment: ${data.paymentMethod}`);
  }
  if (data.paymentBreakdown) {
    for (const pmt of data.paymentBreakdown) {
      const label = `${pmt.method}`;
      let amount = `${pmt.amount.toFixed(2)}`;
      if ((pmt.discount ?? 0) > 0) {
        amount = `-${pmt.discount!.toFixed(2)} ${amount}`;
      }
      p.twoCol(label, amount, cols);
    }
  }

  // ── Preview or Thank You ────────────────────────
  if (data.isPreview) {
    p.feed(1);
    p.divider('═');
    p.alignCenter();
    p.bold(true);
    p.writeln('*** BILL PREVIEW ***');
    p.bold(false);
    p.writeln('Not a Final Invoice');
  } else {
    p.feed(2);
    p.alignCenter();
    p.writeln('Thank You for Visiting!');
    p.writeln('We Hope to See You Again');
    p.feed(1);
    p.writeln('highlandscafemotelinn.com');
  }

  p.feed(3);
  p.cut();

  const result = p.build();
  console.log(`[ESCPOS] buildInvoiceReceipt: invoice=${data.invoiceNumber} isPreview=${!!data.isPreview} paperSize=${data.paperSize} bufferSize=${result.length} bytes`);
  return result;
}

/**
 * Build a Kitchen Order Ticket as ESC/POS commands.
 */
export function buildKitchenKot(data: EscposKotData): Buffer {
  const p = new EscposBuilder();

  p.init();
  p.feed(1);

  // Header
  p.alignCenter();
  p.bold(true);
  p.charSize(2, 2);
  p.writeln(data.businessName);
  p.charSize(1, 1);
  p.writeln('★ KITCHEN ORDER ★');
  p.bold(false);

  p.divider('═');

  // Order info
  const cols = getCols(data.paperSize);
  p.bold(true);
  p.twoCol(data.orderNumber, data.tableOrRoom, cols);
  p.bold(false);
  p.twoCol(data.date, data.time, cols);

  // Optional fields
  if (data.showCustomer && data.customerName) {
    p.writeln(`Customer: ${data.customerName}`);
  }
  if (data.showStaff && data.waiterName) {
    p.writeln(`Waiter: ${data.waiterName}`);
  }

  p.divider('─');

  // Column header
  p.bold(true);
  p.writeln('Qty   ITEM');
  p.bold(false);

  p.divider('─');

  // Items
  let totalQty = 0;
  for (const item of data.items) {
    totalQty += item.quantity;
    p.bold(true);
    p.writeln(`${item.quantity}     ${item.name}`);
    p.bold(false);

    for (const mod of item.modifiers ?? []) {
      p.subLine(`  • ${mod}`);
    }
    for (const addon of item.addons ?? []) {
      p.subLine(`  + ${addon}`);
    }
    if (item.notes) {
      p.subLine(`  Note: ${item.notes}`);
    }
  }

  p.divider('─');

  // Total
  p.bold(true);
  p.writeln(`TOTAL QTY : ${totalQty}`);
  p.bold(false);

  p.feed(3);
  p.cut();

  const result = p.build();
  console.log(`[ESCPOS] buildKitchenKot: order=${data.orderNumber} paperSize=${data.paperSize} bufferSize=${result.length} bytes`);
  return result;
}

/**
 * Test data payload sent from the renderer (print-service.ts) to Electron.
 */
export interface EscposTestData {
  businessName: string;
  address: string[];
  phone: string;
  pan: string;
  paperSize: EscposPaperSize;
  date: string;
  time: string;
}

/**
 * Build a test receipt for printer verification.
 * Uses live business data when available, otherwise falls back to
 * a simple connectivity test.
 */
export function buildTestReceipt(paperSize: EscposPaperSize, testData?: EscposTestData): Buffer {
  const p = new EscposBuilder();
  const cols = getCols(paperSize);
  const now = new Date();
  const date = testData?.date || now.toLocaleDateString('en-GB');
  const time = testData?.time || now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });

  p.init();
  p.feed(1);

  // Header with live business data
  p.alignCenter();
  p.bold(true);
  p.charSize(2, 2);
  p.writeln(testData?.businessName || 'Highlands Cafe & Motel Inn');
  p.charSize(1, 1);
  p.bold(false);

  if (testData?.address) {
    for (const addrLine of testData.address) {
      p.writeln(addrLine);
    }
  }
  if (testData?.phone) p.writeln(`Phone: ${testData.phone}`);
  if (testData?.pan) p.writeln(`PAN: ${testData.pan}`);

  p.divider('═');

  // Test header
  p.alignCenter();
  p.bold(true);
  p.writeln('★ TEST RECEIPT ★');
  p.bold(false);
  p.writeln('*** Printer Verification ***');
  p.alignLeft();

  p.twoCol(`Date: ${date}`, `Time: ${time}`, cols);

  p.divider('─');

  // Sample items
  p.bold(true);
  p.writeln('Item                 Qty   Amount');
  p.bold(false);
  p.divider('─');

  p.itemRow('Test Item 1', 1, 100.00, cols);
  p.itemRow('Test Item 2', 2, 200.00, cols);

  p.divider('─');
  p.twoCol('Subtotal', '300.00', cols);
  p.twoCol('Discount', '-50.00', cols);
  p.feed(1);
  p.bold(true);
  p.charSize(2, 2);
  p.twoCol('TOTAL', '250.00', cols);
  p.charSize(1, 1);
  p.bold(false);

  p.divider('═');

  // Success message
  p.alignCenter();
  p.writeln('✓ Printer configured successfully!');
  p.writeln('If you can read this clearly,');
  p.writeln('your thermal printer is working');
  p.writeln('correctly with the POS system.');

  p.feed(3);
  p.cut();

  const result = p.build();
  console.log(`[ESCPOS] buildTestReceipt: paperSize=${paperSize} bufferSize=${result.length} bytes`);
  return result;
}

/**
 * Build a test KOT for printer verification.
 * Uses live business data when available.
 */
export function buildTestKot(paperSize: EscposPaperSize, testData?: EscposTestData): Buffer {
  const p = new EscposBuilder();
  const cols = getCols(paperSize);
  const now = new Date();
  const date = testData?.date || now.toLocaleDateString('en-GB');
  const time = testData?.time || now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });

  p.init();
  p.feed(1);

  // Header with live business data
  p.alignCenter();
  p.bold(true);
  p.charSize(2, 2);
  p.writeln(testData?.businessName || 'Highlands Cafe & Motel Inn');
  p.charSize(1, 1);
  p.writeln('★ KITCHEN ORDER ★');
  p.bold(false);

  p.divider('═');

  // Order info
  p.bold(true);
  p.twoCol('Order #TEST-001', 'Table 99', cols);
  p.bold(false);
  p.twoCol(`Date: ${date}`, `Time: ${time}`, cols);

  if (testData?.phone) p.writeln(`Phone: ${testData.phone}`);
  if (testData?.pan) p.writeln(`PAN: ${testData.pan}`);

  p.divider('─');

  // Column header
  p.bold(true);
  p.writeln('Qty   ITEM');
  p.bold(false);

  p.divider('─');

  // Sample items
  p.writeln('2     Chicken Mo:Mo');
  p.subLine('  • Steamed');
  p.subLine('  • Extra Spicy');

  p.writeln('1     Veg Pizza');
  p.subLine('  Note: No onion please');

  p.bold(true);
  p.writeln('3     French Fries');
  p.bold(false);
  p.subLine('  + Extra Cheese');

  p.divider('─');
  p.bold(true);
  p.writeln('TOTAL QTY : 6');
  p.bold(false);

  p.feed(2);

  // Success message
  p.alignCenter();
  p.writeln('✓ Kitchen printer working correctly');

  p.feed(3);
  p.cut();

  const result = p.build();
  console.log(`[ESCPOS] buildTestKot: paperSize=${paperSize} bufferSize=${result.length} bytes`);
  return result;
}
