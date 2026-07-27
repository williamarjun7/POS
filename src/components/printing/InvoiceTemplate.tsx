import { useState, useEffect } from 'react';
import { ThermalPrinterLayout } from './ThermalPrinterLayout';
import { usePrintSettings } from '@/lib/services/print-settings';
import logoSrc from '@/assets/logo.png';
import QRCode from 'qrcode';

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
  /** Optional payment breakdown shown on the receipt */
  paymentBreakdown?: Array<{ method: string; amount: number; discount?: number }>;
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
  const [reviewQrDataUri, setReviewQrDataUri] = useState<string>('');

  // Generate QR code from the configured Google Review URL
  useEffect(() => {
    if (!settings.enableGoogleReviewQr || !settings.googleReviewUrl) {
      setReviewQrDataUri('');
      return;
    }

    let cancelled = false;

    QRCode.toDataURL(settings.googleReviewUrl, {
      width: 512,
      margin: 4,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((uri: string) => {
        if (!cancelled) setReviewQrDataUri(uri);
      })
      .catch(() => {
        if (!cancelled) setReviewQrDataUri('');
      });

    return () => { cancelled = true; };
  }, [settings.googleReviewUrl, settings.enableGoogleReviewQr]);

  const showReviewQr = settings.enableGoogleReviewQr && settings.googleReviewUrl && reviewQrDataUri;

  return (
    <ThermalPrinterLayout>
      {/* ── Header ── */}
      <div style={{ textAlign: 'center', marginBottom: '3.5mm' }}>
        {settings.showLogo && (
          <img
            src={logoSrc}
            alt="Logo"
            style={{ height: '18mm', marginBottom: '2mm', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}
          />
        )}
        <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '0.5px' }}>
          Highlands Cafe &amp; Motel Inn
        </div>
        <div style={{ fontSize: '12px', fontWeight: 500, marginTop: '1mm' }}>
          Premium Stays &bull; Great Coffee
        </div>
        <div style={{ fontSize: '11px', fontWeight: 500, marginTop: '1.5mm', lineHeight: 1.5 }}>
          Birendranagar-8, Khajura<br />
          Surkhet, Nepal<br />
          Phone: {settings.phone}<br />
          PAN: {settings.pan}
        </div>
      </div>

      {/* ── Divider ── */}
      <Divider />

      {/* ── Invoice Info ── */}
      <div style={{ marginBottom: '2.5mm' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Invoice #{invoice.invoiceNumber}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 500, marginTop: '0.5mm' }}>
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
          fontWeight: 600,
          fontSize: '12px',
          borderBottom: '1px dashed #000',
          paddingBottom: '1.5mm',
          marginBottom: '1.5mm',
        }}
      >
        <span style={{ flex: 1 }}>Item</span>
        <span style={{ width: '12mm', textAlign: 'right' }}>Qty</span>
        <span style={{ width: '18mm', textAlign: 'right' }}>Amount</span>
      </div>

      {/* ── Items ── */}
      {invoice.items.map((item, idx) => (
        <div key={idx} style={{ marginBottom: '1.2mm' }}>
          {/* Main line */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ flex: 1, fontWeight: 500, paddingRight: '2mm', fontSize: '12px' }}>{item.name}</span>
            <span style={{ width: '12mm', textAlign: 'right', fontSize: '12px', fontWeight: 500 }}>{item.quantity}</span>
            <span style={{ width: '18mm', textAlign: 'right', fontWeight: 500, fontSize: '12px' }}>
              {fmt(item.unitPrice * item.quantity)}
            </span>
          </div>

          {/* Modifiers (indented sub-rows) */}
          {item.modifiers?.map((mod, mi) => (
            <div key={`mod-${mi}`} style={{ paddingLeft: '4mm', fontSize: '10px', fontWeight: 500 }}>
              &bull; {mod}
            </div>
          ))}

          {/* Add-ons */}
          {item.addons?.map((addon, ai) => (
            <div key={`add-${ai}`} style={{ paddingLeft: '4mm', fontSize: '10px', fontWeight: 500 }}>
              + {addon}
            </div>
          ))}

          {/* Notes */}
          {item.notes && (
            <div style={{ paddingLeft: '4mm', fontSize: '10px', fontWeight: 500, fontStyle: 'italic' }}>
              Note: {item.notes}
            </div>
          )}
        </div>
      ))}

      {/* ── Payment Breakdown ── */}
      {invoice.paymentBreakdown && invoice.paymentBreakdown.length > 0 && (
        <>
          <Divider />
          <div style={{ marginBottom: '1.2mm' }}>
            <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '0.8mm' }}>Payment</div>
            {invoice.paymentBreakdown.map((pmt, i) => {
              const hasDiscount = (pmt.discount ?? 0) > 0;
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 500, marginBottom: '0.5mm' }}>
                  <span>{pmt.method}</span>
                  <span style={{ display: 'flex', gap: '2mm' }}>
                    {hasDiscount && (
                      <span style={{ color: '#c00', fontSize: '11px', fontWeight: 600 }}>-{fmt(pmt.discount)}</span>
                    )}
                    <span>{fmt(pmt.amount)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Totals ── */}
      <Divider />
      <div style={{ marginTop: '2mm' }}>
        <Row label="Subtotal" value={fmt(invoice.subtotal)} />
        {hasDiscount && (
          <Row label="Discount" value={`-${fmt(invoice.discount ?? 0)}`} valueColor="#c00" />
        )}
        <div
          style={{
            borderTop: '1.5px solid #000',
            marginTop: '1.5mm',
            paddingTop: '1.5mm',
            display: 'flex',
            justifyContent: 'space-between',
            fontWeight: 800,
            fontSize: '18px',
          }}
        >
          <span>TOTAL</span>
          <span>{fmt(invoice.total)}</span>
        </div>
      </div>

      {/* ── Footer ── */}
      <Divider />
      <div style={{ textAlign: 'center', marginTop: '2.5mm' }}>
        {showReviewQr ? (
          <>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '1mm', letterSpacing: '1px' }}>
              &#9733;&#9733;&#9733;&#9733;&#9733;
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '0.5mm' }}>
              Enjoyed your visit?
            </div>
            <div style={{ fontSize: '11px', fontWeight: 500, marginBottom: '2mm', lineHeight: 1.4 }}>
              Please scan the QR code below to leave us a Google Review.
            </div>
            <div style={{ padding: '1.5mm' }}>
              <img
                src={reviewQrDataUri}
                alt="Google Review QR"
                style={{
                  height: '35mm',
                  width: '35mm',
                  display: 'block',
                  margin: '0 auto',
                  imageRendering: 'crisp-edges',
                  background: '#fff',
                }}
              />
            </div>
            <div style={{ fontSize: '11px', fontWeight: 500, marginTop: '1mm', lineHeight: 1.5 }}>
              Thank you for supporting Highlands Cafe &amp; Motel Inn.
            </div>
          </>
        ) : (
          <div style={{ fontSize: '12px', fontWeight: 500, marginBottom: '2mm' }}>
            Thank You For Visiting!
          </div>
        )}
        <div style={{ fontSize: '11px', fontWeight: 500, marginTop: showReviewQr ? '2mm' : '1mm', lineHeight: 1.5 }}>
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
        borderTop: '1px dashed #000',
        margin: '2.5mm 0',
      }}
    />
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 500, marginBottom: '0.5mm' }}>
      <span>{label}</span>
      <span style={{ color: valueColor ?? '#000' }}>{value}</span>
    </div>
  );
}
