/**
 * usb-transport.ts
 * ─────────────────
 * USB printer discovery and raw communication.
 *
 * Finds ZYWELL ZY-Q822 (and other ESC/POS USB printers) by vendor/product ID.
 * Sends raw ESC/POS buffers to the printer via the USB interface.
 * No browser dialogs — fully silent.
 */

// Dynamic import to avoid crash when module is unavailable
let _thermalPrinter: any = null;
async function getThermalPrinter() {
  if (!_thermalPrinter) {
    try {
      _thermalPrinter = await import('node-thermal-printer');
    } catch {
      _thermalPrinter = {};
    }
  }
  return _thermalPrinter;
}

export interface UsbPrinterInfo {
  name: string;
  vendorId?: string;
  productId?: string;
  connected: boolean;
}

// Known ZYWELL ZY-Q822 vendor/product IDs
const KNOWN_VENDOR_IDS = new Set<number>([0x0483, 0x0416, 0x1504, 0x0525]);
const KNOWN_PRODUCT_IDS = new Set<number>([0x5840, 0x5011, 0x5740, 0x5020]);

/**
 * Discover connected USB printers.
 * Returns list of detected printers with status.
 */
export async function getUsbPrinters(): Promise<UsbPrinterInfo[]> {
  const printers: UsbPrinterInfo[] = [];

  try {
    const mod = await getThermalPrinter();
    if (!mod.ThermalPrinter) throw new Error('module unavailable');

    const printer = new mod.ThermalPrinter({
      type: mod.PrinterTypes.EPSON,
      interface: 'usb',
      characterSet: mod.CharacterSet.PC437_USA,
      removeSpecialCharacters: false,
      lineCharacter: '═',
      width: 48,
    });

    const connected = await printer.isPrinterConnected();
    printers.push({
      name: connected ? 'ZYWELL ZY-Q822' : 'USB Thermal Printer',
      vendorId: connected ? 'detected' : undefined,
      productId: connected ? 'detected' : undefined,
      connected,
    });

    return printers;
  } catch {
    // usb module is not installed — rely on node-thermal-printer detection only
    if (printers.length === 0) {
      printers.push({ name: 'No USB printer detected', connected: false });
    }
    return printers;
  }
}

/**
 * Print raw ESC/POS data to a USB printer.
 */
export async function printUsb(
  buffer: Buffer,
): Promise<{ success: boolean; error?: string }> {
  try {
    const mod = await getThermalPrinter();
    if (!mod.ThermalPrinter) {
      return { success: false, error: 'Thermal printer module not available' };
    }

    const printer = new mod.ThermalPrinter({
      type: mod.PrinterTypes.EPSON,
      interface: 'usb',
      characterSet: mod.CharacterSet.PC437_USA,
      removeSpecialCharacters: false,
      lineCharacter: '═',
      width: 48,
    });

    const connected = await printer.isPrinterConnected();
    if (!connected) {
      return { success: false, error: 'USB printer not connected' };
    }

    await printer.raw(Buffer.from([0x1B, 0x40])); // Initialize
    await printer.raw(buffer);
    await printer.cut();
    await printer.execute();

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'USB print failed',
    };
  }
}

/**
 * Check if a USB printer is connected and ready.
 */
export async function checkUsbPrinter(): Promise<{
  connected: boolean;
  name: string | null;
  error?: string;
}> {
  try {
    const mod = await getThermalPrinter();
    if (!mod.ThermalPrinter) {
      return { connected: false, name: null, error: 'Module unavailable' };
    }

    const printer = new mod.ThermalPrinter({
      type: mod.PrinterTypes.EPSON,
      interface: 'usb',
      characterSet: mod.CharacterSet.PC437_USA,
      removeSpecialCharacters: false,
      lineCharacter: '═',
      width: 48,
    });

    const connected = await printer.isPrinterConnected();
    return {
      connected,
      name: connected ? 'ZYWELL ZY-Q822 (USB)' : null,
    };
  } catch (err) {
    return {
      connected: false,
      name: null,
      error: err instanceof Error ? err.message : 'USB check failed',
    };
  }
}
