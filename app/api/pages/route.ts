import { env } from 'cloudflare:workers';
import { validateHtmlServer } from '@/lib/html-validation';
import { memoryIdempotency, memoryPages } from '@/lib/page-store';

const MAX_BYTES = 1024 * 1024;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const SESSION_LIMIT = 10;
const IP_LIMIT = 300;

type CountRow = { count: number | string };

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
function shouldUseMemory() { return typeof process === 'undefined' || process.env?.NODE_ENV !== 'production'; }
function getClientIp(request: Request) { return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'local'; }
async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS pages (page_id TEXT PRIMARY KEY, object_key TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, client_hash TEXT, ip_hash TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS pages_expiry_idx ON pages (expires_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS pages_client_idx ON pages (client_hash, created_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS pages_ip_idx ON pages (ip_hash, created_at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS idempotency (idempotency_key TEXT PRIMARY KEY, sha256 TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL)'),
  ]);
}
async function countFor(db: D1Database | undefined, field: 'client_hash' | 'ip_hash', value: string, since: number) {
  if (!db) return 0;
  const row = await db.prepare(`SELECT COUNT(*) as count FROM pages WHERE ${field} = ?1 AND created_at >= ?2`).bind(value, since).first<CountRow>();
  return Number(row?.count || 0);
}
function memoryCount(field: 'clientHash' | 'ipHash', value: string, since: number) { let count = 0; for (const page of memoryPages.values()) if (page[field] === value && page.createdAt >= since) count += 1; return count; }
function checkOrigin(request: Request) { const origin = request.headers.get('Origin'); return !origin || origin === new URL(request.url).origin; }

export async function POST(request: Request) {
  const id = requestId();
  if (!checkOrigin(request)) return errorResponse('ORIGIN_NOT_ALLOWED', '허용되지 않은 요청 출처입니다.', 403, id);
  const key = request.headers.get('Idempotency-Key')?.trim() || '';
  if (!/^[A-Za-z0-9._~-]{8,120}$/.test(key)) return errorResponse('IDEMPOTENCY_KEY_REQUIRED', '게시 요청을 다시 시도해 주세요.', 400, id);
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_BYTES + 24_000) return errorResponse('FILE_TOO_LARGE', '파일 크기는 1MB 이하여야 합니다.', 413, id);

  const db = env.DB;
  const files = env.FILES;
  const memoryMode = (!db || !files) && shouldUseMemory();
  if (!memoryMode && (!db || !files)) return errorResponse('PUBLISH_UNAVAILABLE', '게시 서비스를 준비 중입니다. 잠시 후 다시 시도해 주세요.', 503, id);
  if (db) await ensureSchema(db);

  const sessionCookie = cookieValue(request.headers.get('Cookie') || '', 'ai_lab_session');
  const sessionToken = sessionCookie || randomId(18);
  const clientHash = await sha256(sessionToken);
  const ipHash = await sha256(getClientIp(request));
  const now = Date.now();
  const since = now - RATE_WINDOW_MS;
  const previous = memoryMode ? memoryIdempotency.get(key) : await db?.prepare('SELECT sha256, response_json as response, created_at as createdAt FROM idempotency WHERE idempotency_key = ?1').bind(key).first<{ sha256: string; response: string; createdAt: number }>();

  let file: File;
  try {
    const form = await request.formData();
    const entries = form.getAll('file');
    if (entries.length !== 1 || !(entries[0] instanceof File)) return errorResponse('FILE_REQUIRED', 'index.html 파일 하나를 선택해 주세요.', 400, id);
    file = entries[0];
  } catch { return errorResponse('INVALID_MULTIPART', '파일을 읽을 수 없습니다. 다시 선택해 주세요.', 400, id); }
  if (file.size > MAX_BYTES) return errorResponse('FILE_TOO_LARGE', '파일 크기는 1MB 이하여야 합니다.', 413, id);
  const bytes = await file.arrayBuffer();
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return errorResponse('INVALID_ENCODING', 'UTF-8 형식의 HTML 파일만 올릴 수 있습니다.', 400, id); }
  const digest = await sha256(bytes);
  if (previous) {
    if (previous.sha256 !== digest) return errorResponse('IDEMPOTENCY_CONFLICT', '같은 게시 요청 키로 다른 파일을 보낼 수 없습니다.', 409, id);
    return json(JSON.parse(previous.response), 201, { 'Set-Cookie': `ai_lab_session=${sessionToken}; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Lax` });
  }

  const sessionCount = (memoryMode ? memoryCount('clientHash', clientHash, since) : await countFor(db, 'client_hash', clientHash, since));
  const ipCount = (memoryMode ? memoryCount('ipHash', ipHash, since) : await countFor(db, 'ip_hash', ipHash, since));
  if (sessionCount >= SESSION_LIMIT || ipCount >= IP_LIMIT) return errorResponse('RATE_LIMITED', '잠시 후 다시 시도해 주세요. 게시 횟수 제한에 도달했습니다.', 429, id);
  const validation = validateHtmlServer(text, file.name, file.size);
  if (validation.issues.length) return errorResponse('HTML_REJECTED', '파일을 확인한 뒤 다시 올려 주세요.', 422, id, validation.issues);

  const createdAt = now;
  const expiresAt = now + RETENTION_MS;
  let pageId = randomId(16);
  let stored = false;
  for (let attempt = 0; attempt < 3 && !stored; attempt += 1) {
    const objectKey = `pages/${pageId}/index.html`;
    try {
      if (memoryMode) {
        memoryPages.set(pageId, { pageId, html: text, sizeBytes: file.size, sha256: digest, createdAt, expiresAt, clientHash, ipHash });
        stored = true;
      } else {
        await files!.put(objectKey, bytes, { httpMetadata: { contentType: 'text/html; charset=utf-8', cacheControl: 'public, max-age=300' }, customMetadata: { pageId, createdAt: String(createdAt), expiresAt: String(expiresAt), sha256: digest } });
        await db!.prepare('INSERT INTO pages (page_id, object_key, size_bytes, sha256, created_at, expires_at, client_hash, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)').bind(pageId, objectKey, file.size, digest, createdAt, expiresAt, clientHash, ipHash).run();
        stored = true;
      }
    } catch {
      pageId = randomId(16);
    }
  }
  if (!stored) return errorResponse('PUBLISH_FAILED', '게시 중 문제가 발생했습니다. 다시 시도해 주세요.', 503, id);
  const requestUrl = new URL(request.url);
  const resultOrigin = env.RESULT_ORIGIN || requestUrl.origin;
  const responseBody = { pageId, url: `${resultOrigin.replace(/\/$/, '')}/p/${pageId}`, createdAt: new Date(createdAt).toISOString(), expiresAt: new Date(expiresAt).toISOString() };
  const responseJson = JSON.stringify(responseBody);
  try {
    if (memoryMode) memoryIdempotency.set(key, { sha256: digest, response: responseJson, createdAt });
    else await db!.prepare('INSERT INTO idempotency (idempotency_key, sha256, response_json, created_at) VALUES (?1, ?2, ?3, ?4)').bind(key, digest, responseJson, createdAt).run();
  } catch { /* a concurrent retry can safely read the first response */ }
  return json(responseBody, 201, { 'Set-Cookie': `ai_lab_session=${sessionToken}; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Lax` });
}
