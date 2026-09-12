import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const checkoutPayments = sqliteTable('checkout_payments', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  sender: text('sender').notNull(),
  recipient: text('recipient').notNull(),
  amountUnits: text('amount_units').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  afterBlock: integer('after_block').notNull(),
  txHash: text('tx_hash'),
  candidateHash: text('candidate_hash'),
  status: text('status').notNull().default('pending'),
  checkedAt: integer('checked_at').notNull().default(0),
  completedAt: integer('completed_at'),
}, table => [
  uniqueIndex('checkout_payments_tx').on(table.txHash),
  index('checkout_payments_owner_created').on(table.owner, table.createdAt),
  index('checkout_payments_pending').on(table.status, table.checkedAt),
]);
