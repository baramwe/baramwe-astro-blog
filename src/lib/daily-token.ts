function todayUTC(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function mmddyyUTC(): string {
  const d = new Date();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(2);
  return mm + dd + yy;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generateDailyToken(): Promise<string> {
  return (await hmacHex(mmddyyUTC(), todayUTC())).slice(0, 8);
}

export async function verifyDailyToken(input: string): Promise<boolean> {
  const expected = await generateDailyToken();
  if (input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
