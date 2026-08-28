import { memoryIdempotency, memoryPages, type MemoryPage } from './page-store';

export type StoredPage = MemoryPage;
export type IdemRecord = { sha256: string; response: string; createdAt: number };

export type PageStore = {
  mode: 'cloudflare' | 'disk' | 'memory';
  resultOrigin?: string;
  insertPage(page: StoredPage): Promise<boolean>;
  getPage(pageId: string): Promise<StoredPage | null>;
  countRecent(field: 'clientHash' | 'ipHash', value: string, since: number): Promise<number>;
  getIdempotency(key: string): Promise<IdemRecord | null>;
  putIdempotency(key: string, record: IdemRecord): Promise<void>;
};

type CfEnv = { DB?: D1Database; FILES?: R2Bucket; RESULT_ORIGIN?: string };
type NodeFs = typeof import('node:fs/promises');
type NodePath = typeof import('node:path');
type NodeIo = { fs: NodeFs; path: NodePath };
type PageRow = { page_id: string; object_key: string; size_bytes: number; sha256: string; created_at: number; expires_at: number };
type CountRow = { count: number | string };

// `cloudflare:workers`는 workerd에서만 로드된다. Node(`vinext start`)에서는 실패하므로 동적 import로 감싼다.
async function getCfEnv(): Promise<CfEnv> {
  try {
    const mod = (await import(/* @vite-ignore */ 'cloudflare:workers')) as { env?: CfEnv };
    return mod.env ?? {};
  } catch {
    return {};
  }
}

async function getNodeIo(): Promise<NodeIo | null> {
  try {
    const fs = (await import(/* @vite-ignore */ 'node:fs/promises')) as NodeFs;
    const path = (await import(/* @vite-ignore */ 'node:path')) as NodePath;
    await fs.stat('.');
    return { fs, path };
  } catch {
    return null;
  }
}

function processEnv(name: string) {
  return typeof process !== 'undefined' ? process.env?.[name] : undefined;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cloudflareStore(env: CfEnv): PageStore {
  const db = env.DB!;
  const files = env.FILES!;
  let schemaReady: Promise<unknown> | null = null;
  const ensureSchema = () => schemaReady ??= db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS pages (page_id TEXT PRIMARY KEY, object_key TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, client_hash TEXT, ip_hash TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS pages_expiry_idx ON pages (expires_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS pages_client_idx ON pages (client_hash, created_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS pages_ip_idx ON pages (ip_hash, created_at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS idempotency (idempotency_key TEXT PRIMARY KEY, sha256 TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL)'),
  ]);
  return {
    mode: 'cloudflare',
    resultOrigin: env.RESULT_ORIGIN,
    async insertPage(page) {
      await ensureSchema();
      const objectKey = `pages/${page.pageId}/index.html`;
      try {
        await files.put(objectKey, page.html, { httpMetadata: { contentType: 'text/html; charset=utf-8', cacheControl: 'public, max-age=300' }, customMetadata: { pageId: page.pageId, createdAt: String(page.createdAt), expiresAt: String(page.expiresAt), sha256: page.sha256 } });
        await db.prepare('INSERT INTO pages (page_id, object_key, size_bytes, sha256, created_at, expires_at, client_hash, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)').bind(page.pageId, objectKey, page.sizeBytes, page.sha256, page.createdAt, page.expiresAt, page.clientHash ?? null, page.ipHash ?? null).run();
        return true;
      } catch {
        return false;
      }
    },
    async getPage(pageId) {
      await ensureSchema();
      const row = await db.prepare('SELECT page_id, object_key, size_bytes, sha256, created_at, expires_at FROM pages WHERE page_id = ?1').bind(pageId).first<PageRow>();
      if (!row || row.expires_at <= Date.now()) return null;
      const object = await files.get(row.object_key);
      if (!object) return null;
      return { pageId, html: await object.text(), sizeBytes: row.size_bytes, sha256: row.sha256, createdAt: row.created_at, expiresAt: row.expires_at };
    },
    async countRecent(field, value, since) {
      await ensureSchema();
      const column = field === 'clientHash' ? 'client_hash' : 'ip_hash';
      const row = await db.prepare(`SELECT COUNT(*) as count FROM pages WHERE ${column} = ?1 AND created_at >= ?2`).bind(value, since).first<CountRow>();
      return Number(row?.count || 0);
    },
    async getIdempotency(key) {
      await ensureSchema();
      const row = await db.prepare('SELECT sha256, response_json as response, created_at as createdAt FROM idempotency WHERE idempotency_key = ?1').bind(key).first<IdemRecord>();
      return row ?? null;
    },
    async putIdempotency(key, record) {
      await ensureSchema();
      await db.prepare('INSERT INTO idempotency (idempotency_key, sha256, response_json, created_at) VALUES (?1, ?2, ?3, ?4)').bind(key, record.sha256, record.response, record.createdAt).run();
    },
  };
}

function diskStore(io: NodeIo, env: CfEnv): PageStore {
  const { fs, path } = io;
  const root = path.resolve(processEnv('PAGES_DATA_DIR') || 'data');
  const pagesDir = path.join(root, 'pages');
  const idemDir = path.join(root, 'idempotency');
  let ready: Promise<unknown> | null = null;
  const ensureDirs = () => ready ??= Promise.all([fs.mkdir(pagesDir, { recursive: true }), fs.mkdir(idemDir, { recursive: true })]);
  const pagePath = (pageId: string) => path.join(pagesDir, `${pageId}.json`);
  async function readPage(filePath: string): Promise<StoredPage | null> {
    try { return JSON.parse(await fs.readFile(filePath, 'utf8')) as StoredPage; } catch { return null; }
  }
  return {
    mode: 'disk',
    resultOrigin: env.RESULT_ORIGIN || processEnv('RESULT_ORIGIN'),
    async insertPage(page) {
      await ensureDirs();
      try {
        await fs.writeFile(pagePath(page.pageId), JSON.stringify(page), { encoding: 'utf8', flag: 'wx' });
        return true;
      } catch {
        return false;
      }
    },
    async getPage(pageId) {
      await ensureDirs();
      const page = await readPage(pagePath(pageId));
      if (!page) return null;
      if (page.expiresAt <= Date.now()) {
        await fs.unlink(pagePath(pageId)).catch(() => undefined);
        return null;
      }
      return page;
    },
    async countRecent(field, value, since) {
      await ensureDirs();
      const now = Date.now();
      let count = 0;
      let names: string[] = [];
      try { names = await fs.readdir(pagesDir); } catch { return 0; }
      for (const name of names) {
        if (!name.endsWith('.json')) continue;
        const page = await readPage(path.join(pagesDir, name));
        if (!page) continue;
        if (page.expiresAt <= now) { await fs.unlink(path.join(pagesDir, name)).catch(() => undefined); continue; }
        if (page[field] === value && page.createdAt >= since) count += 1;
      }
      return count;
    },
    async getIdempotency(key) {
      await ensureDirs();
      const filePath = path.join(idemDir, `${await sha256Hex(key)}.json`);
      try { return JSON.parse(await fs.readFile(filePath, 'utf8')) as IdemRecord; } catch { return null; }
    },
    async putIdempotency(key, record) {
      await ensureDirs();
      const filePath = path.join(idemDir, `${await sha256Hex(key)}.json`);
      await fs.writeFile(filePath, JSON.stringify(record), 'utf8');
    },
  };
}

function memoryStore(env: CfEnv): PageStore {
  return {
    mode: 'memory',
    resultOrigin: env.RESULT_ORIGIN || processEnv('RESULT_ORIGIN'),
    async insertPage(page) {
      if (memoryPages.has(page.pageId)) return false;
      memoryPages.set(page.pageId, page);
      return true;
    },
    async getPage(pageId) {
      const page = memoryPages.get(pageId);
      if (!page) return null;
      if (page.expiresAt <= Date.now()) { memoryPages.delete(pageId); return null; }
      return page;
    },
    async countRecent(field, value, since) {
      let count = 0;
      for (const page of memoryPages.values()) if (page[field] === value && page.createdAt >= since) count += 1;
      return count;
    },
    async getIdempotency(key) {
      return memoryIdempotency.get(key) ?? null;
    },
    async putIdempotency(key, record) {
      memoryIdempotency.set(key, record);
    },
  };
}

let storePromise: Promise<PageStore> | null = null;

export function getStore(): Promise<PageStore> {
  return storePromise ??= (async () => {
    const env = await getCfEnv();
    if (env.DB && env.FILES) return cloudflareStore(env);
    const io = await getNodeIo();
    if (io) return diskStore(io, env);
    return memoryStore(env);
  })();
}
