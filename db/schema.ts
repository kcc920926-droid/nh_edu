import { integer, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const pages = sqliteTable('pages', {
  pageId: text('page_id').primaryKey(),
  objectKey: text('object_key').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  clientHash: text('client_hash'),
  ipHash: text('ip_hash'),
}, (table) => ({
  expiryIndex: index('pages_expiry_idx').on(table.expiresAt),
  clientIndex: index('pages_client_idx').on(table.clientHash, table.createdAt),
  ipIndex: index('pages_ip_idx').on(table.ipHash, table.createdAt),
}));

export const idempotency = sqliteTable('idempotency', {
  idempotencyKey: text('idempotency_key').primaryKey(),
  sha256: text('sha256').notNull(),
  responseJson: text('response_json').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => ({
  createdIndex: index('idempotency_created_idx').on(table.createdAt),
}));
