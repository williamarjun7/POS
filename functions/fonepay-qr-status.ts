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
    const { prn } = await req.json();

    const merchantCode = Deno.env.get('FONEPAY_MERCHANT_CODE')!;
    const username = Deno.env.get('FONEPAY_USERNAME')!;
    const password = Deno.env.get('FONEPAY_PASSWORD')!;
    const secretKey = Deno.env.get('FONEPAY_SECRET_KEY')!;
    const apiBase = Deno.env.get('FONEPAY_API_BASE_URL')!;

    const dataValidation = await hmacSHA512(secretKey, `${prn},${merchantCode}`);

    const resp = await fetch(
      `${apiBase}/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          prn,
          merchantCode,
          dataValidation,
          username,
          password,
        }),
      },
    );

    const data = await resp.json();
    return json(data, resp.status);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
}
