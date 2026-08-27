export type MemoryPage = {
  pageId: string;
  html: string;
  sizeBytes: number;
  sha256: string;
  createdAt: number;
  expiresAt: number;
  clientHash?: string;
  ipHash?: string;
};

type StoreGlobals = typeof globalThis & {
  __aiLabMemoryPages?: Map<string, MemoryPage>;
  __aiLabMemoryIdempotency?: Map<string, { sha256: string; response: string; createdAt: number }>;
};

const globals = globalThis as StoreGlobals;
export const memoryPages = globals.__aiLabMemoryPages ??= new Map();
export const memoryIdempotency = globals.__aiLabMemoryIdempotency ??= new Map();
