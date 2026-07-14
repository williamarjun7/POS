/**
 * ThermalPrinterLayout
 * ─────────────────────
 * Shared 80mm thermal printer layout with injectable @media print styles.
 * Wraps print content in a centered, styled container for both screen preview
 * and physical thermal printing.
 *
 * Usage:
 *   <ThermalPrinterLayout>
 *     <InvoiceTemplate invoice={...} />
 *   </ThermalPrinterLayout>
 *
 * For direct window.print(), call printService() instead.
 */

import React from 'react';

/* ── Injected into <head> once on first render ── */
const THERMAL_PRINT_STYLES = `
  @media print {
    @page {
      size: 80mm auto;
      margin: 0;
    }
    body {
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    * {
      box-shadow: none !important;
      text-shadow: none !important;
      background-image: none !important;
    }
  }
`;

let stylesInjected = false;

function injectThermalStyles() {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = THERMAL_PRINT_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}

/* ── Component ── */

interface ThermalPrinterLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function ThermalPrinterLayout({ children, className = '' }: ThermalPrinterLayoutProps) {
  React.useEffect(() => {
    injectThermalStyles();
  }, []);

  return (
    <div
      className={`mx-auto bg-white text-black ${className}`}
      style={{
        width: '80mm',
        maxWidth: '80mm',
        padding: '4mm 3mm',
        fontFamily: "'Courier New', 'Courier', monospace",
        fontSize: '10px',
        lineHeight: 1.4,
        color: '#000',
        backgroundColor: '#fff',
      }}
    >
      {children}
    </div>
  );
}
