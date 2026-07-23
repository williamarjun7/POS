const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function hmacSHA512(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const { amount, prn, remarks1, remarks2 } = await req.json();

    const merchantCode = Deno.env.get('FONEPAY_MERCHANT_CODE');
    const username = Deno.env.get('FONEPAY_USERNAME');
    const password = Deno.env.get('FONEPAY_PASSWORD');
    const secretKey = Deno.env.get('FONEPAY_SECRET_KEY');
    const apiBase = Deno.env.get('FONEPAY_API_BASE_URL');

    if (!merchantCode) return json({ error: 'Missing Fonepay configuration: FONEPAY_MERCHANT_CODE' }, 500);
    if (!username) return json({ error: 'Missing Fonepay configuration: FONEPAY_USERNAME' }, 500);
    if (!password) return json({ error: 'Missing Fonepay configuration: FONEPAY_PASSWORD' }, 500);
    if (!secretKey) return json({ error: 'Missing Fonepay configuration: FONEPAY_SECRET_KEY' }, 500);
    if (!apiBase) return json({ error: 'Missing Fonepay configuration: FONEPAY_API_BASE_URL' }, 500);

    const amountStr = String(Math.round(amount));
    const parts = [amountStr, prn, merchantCode, remarks1 || 'POS Payment', remarks2 || ''];
    const dataValidation = await hmacSHA512(secretKey, parts.join(','));

    const body: Record<string, unknown> = {
      amount: amountStr,
      remarks1: remarks1 || 'POS Payment',
      remarks2: remarks2 || '',
      prn,
      merchantCode,
      dataValidation,
      username,
      password,
    };


    const resp = await fetch(
      `${apiBase}/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      },
    );

    const data = await resp.json();
    return json(data, resp.status);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
}
