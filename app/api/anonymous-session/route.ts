function token() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function POST(request: Request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return new Response(JSON.stringify({ error: 'ORIGIN_NOT_ALLOWED' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  const existing = request.headers.get('Cookie')?.split(';').some((part) => part.trim().startsWith('ai_lab_session='));
  if (existing) return new Response(null, { status: 204 });
  return new Response(null, { status: 204, headers: { 'Set-Cookie': `ai_lab_session=${token()}; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Lax`, 'Cache-Control': 'no-store' } });
}
