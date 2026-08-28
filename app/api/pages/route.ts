import { validateHtmlServer } from '@/lib/html-validation';
import { getStore } from '@/lib/server-store';

const MAX_BYTES = 1024 * 1024;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const SESSION_LIMIT = 10;
const IP_LIMIT = 300;

function requestId() { return randomId(6); }
function randomId(byteLength = 16) {
  const bytes = new Uint8Array(byteLength); crypto.getRandomValues(bytes);
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function sha256(value: ArrayBuffer | string) {
  const digest = await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function json(body: unknown, status = 200, extra?: HeadersInit) { const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); return new Response(JSON.stringify(body), { status, headers }); }
function errorResponse(code: string, message: string, status: number, id: string, issues?: unknown[]) { return json({ error: { code, message, requestId: id, ...(issues ? { issues } : {}) } }, status); }
function cookieValue(header: string, name: string) { const found = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`)); return found?.slice(name.length + 1) || ''; }
function getClientIp(request: Request) { return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'local'; }
function checkOrigin(request: Request) { const origin = request.headers.get('Origin'); return !origin || origin === new URL(request.url).origin; }
function publicBase(request: Request, resultOrigin?: string) {
  if (resultOrigin) return resultOrigin.replace(/\/$/, '');
  const requestUrl = new URL(request.url);
  const proto = request.headers.get('X-Forwarded-Proto')?.split(',')[0].trim() || requestUrl.protocol.replace(':', '');
  const basePath = requestUrl.pathname.replace(/\/api\/pages\/?$/, '');
  return `${proto}://${requestUrl.host}${basePath}`;
}

export async function POST(request: Request) {
  const id = requestId();
  if (!checkOrigin(request)) return errorResponse('ORIGIN_NOT_ALLOWED', '현재 교육 사이트에서 다시 열어 주세요.', 403, id);
  const key = request.headers.get('Idempotency-Key')?.trim() || '';
  if (!/^[A-Za-z0-9._~-]{8,120}$/.test(key)) return errorResponse('IDEMPOTENCY_KEY_REQUIRED', '게시 버튼을 한 번 더 눌러 주세요.', 400, id);
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_BYTES + 24_000) return errorResponse('FILE_TOO_LARGE', '파일 크기는 1MB 이하여야 합니다.', 413, id);

  let store;
  try { store = await getStore(); } catch { return errorResponse('PUBLISH_UNAVAILABLE', '게시 기능을 준비하고 있어요. 잠시 뒤 버튼을 다시 눌러 주세요.', 503, id); }

  const sessionCookie = cookieValue(request.headers.get('Cookie') || '', 'ai_lab_session');
  const sessionToken = sessionCookie || randomId(18);
  const clientHash = await sha256(sessionToken);
  const ipHash = await sha256(getClientIp(request));
  const now = Date.now();
  const since = now - RATE_WINDOW_MS;
  const previous = await store.getIdempotency(key);

  let file: File;
  try {
    const form = await request.formData();
    const entries = form.getAll('file');
    if (entries.length !== 1 || !(entries[0] instanceof File)) return errorResponse('FILE_REQUIRED', 'index.html 파일 하나를 선택해 주세요.', 400, id);
    file = entries[0];
  } catch { return errorResponse('INVALID_MULTIPART', '파일을 다시 골라 주세요.', 400, id); }
  if (file.size > MAX_BYTES) return errorResponse('FILE_TOO_LARGE', '파일 크기는 1MB 이하여야 합니다.', 413, id);
  const bytes = await file.arrayBuffer();
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return errorResponse('INVALID_ENCODING', 'UTF-8 형식의 HTML 파일만 올릴 수 있습니다.', 400, id); }
  const digest = await sha256(bytes);
  if (previous) {
    if (previous.sha256 !== digest) return errorResponse('IDEMPOTENCY_CONFLICT', '새 게시 요청으로 이어가 주세요.', 409, id);
    return json(JSON.parse(previous.response), 201, { 'Set-Cookie': `ai_lab_session=${sessionToken}; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Lax` });
  }

  const sessionCount = await store.countRecent('clientHash', clientHash, since);
  const ipCount = await store.countRecent('ipHash', ipHash, since);
  if (sessionCount >= SESSION_LIMIT || ipCount >= IP_LIMIT) return errorResponse('RATE_LIMITED', '잠시 쉬었다가 다시 게시해 주세요.', 429, id);
  const validation = validateHtmlServer(text, file.name, file.size);
  if (validation.issues.length) return errorResponse('HTML_REJECTED', '파일을 확인한 뒤 다시 올려 주세요.', 422, id, validation.issues);

  const createdAt = now;
  const expiresAt = now + RETENTION_MS;
  let pageId = randomId(16);
  let stored = false;
  for (let attempt = 0; attempt < 3 && !stored; attempt += 1) {
    stored = await store.insertPage({ pageId, html: text, sizeBytes: file.size, sha256: digest, createdAt, expiresAt, clientHash, ipHash });
    if (!stored) pageId = randomId(16);
  }
  if (!stored) return errorResponse('PUBLISH_FAILED', '게시가 잠시 멈췄어요. 버튼을 한 번 더 눌러 주세요.', 503, id);
  const responseBody = { pageId, url: `${publicBase(request, store.resultOrigin)}/p/${pageId}`, createdAt: new Date(createdAt).toISOString(), expiresAt: new Date(expiresAt).toISOString() };
  try {
    await store.putIdempotency(key, { sha256: digest, response: JSON.stringify(responseBody), createdAt });
  } catch { /* a concurrent retry can safely read the first response */ }
  return json(responseBody, 201, { 'Set-Cookie': `ai_lab_session=${sessionToken}; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Lax` });
}
