import {
  pgTable,
  uuid,
  text,
  numeric,
  jsonb,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const transactionStatus = pgEnum("transaction_status", [
  "pending",
  "allowed",
  "held",
  "blocked",
]);

export const caseStatus = pgEnum("case_status", ["open", "closed"]);

export const casePriority = pgEnum("case_priority", ["low", "medium", "high"]);

export const caseDecisionType = pgEnum("case_decision_type", [
  "approve",
  "reject",
  "escalate",
]);

// To be wired in the future, analysts will have their own authentication board with a foreign key assigned to them
export const analysts = pgTable("analysts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("analyst"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Idempotency key from the payment provider — webhooks retry, so this must be unique.
    externalId: text("external_id").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    merchantId: text("merchant_id").notNull(),
    customerId: text("customer_id"),
    cardBin: text("card_bin"),
    cardLast4: text("card_last4"),
    ipAddress: text("ip_address"),
    deviceId: text("device_id"),
    status: transactionStatus("status").notNull().default("pending"),
    riskScore: numeric("risk_score", { precision: 5, scale: 4 }),
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("transactions_external_id_idx").on(table.externalId),
    index("transactions_customer_id_idx").on(table.customerId),
    index("transactions_card_bin_idx").on(table.cardBin),
    index("transactions_created_at_idx").on(table.createdAt),
  ]
);

export const cases = pgTable(
  "cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    status: caseStatus("status").notNull().default("open"),
    priority: casePriority("priority").notNull().default("medium"),
    assignedTo: uuid("assigned_to").references(() => analysts.id, {
      onDelete: "set null",
    }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("cases_transaction_id_idx").on(table.transactionId),
    index("cases_status_idx").on(table.status),
  ]
);

export const caseDecisions = pgTable(
  "case_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    analystId: uuid("analyst_id")
      .notNull()
      .references(() => analysts.id, { onDelete: "restrict" }),
    decision: caseDecisionType("decision").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("case_decisions_case_id_idx").on(table.caseId)]
);

// Append-only trail of everything that happened to a transaction/case, independent
// of the domain tables — kept even if the underlying row is later modified.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    actor: text("actor").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_log_entity_idx").on(table.entityType, table.entityId)]
);

export const transactionsRelations = relations(transactions, ({ many }) => ({
  cases: many(cases),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  transaction: one(transactions, {
    fields: [cases.transactionId],
    references: [transactions.id],
  }),
  assignedAnalyst: one(analysts, {
    fields: [cases.assignedTo],
    references: [analysts.id],
  }),
  decisions: many(caseDecisions),
}));

export const caseDecisionsRelations = relations(caseDecisions, ({ one }) => ({
  case: one(cases, {
    fields: [caseDecisions.caseId],
    references: [cases.id],
  }),
  analyst: one(analysts, {
    fields: [caseDecisions.analystId],
    references: [analysts.id],
  }),
}));

export const analystsRelations = relations(analysts, ({ many }) => ({
  assignedCases: many(cases),
  decisions: many(caseDecisions),
}));
