import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  doublePrecision,
  jsonb,
  index,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Money is stored as integer centimes (1 MAD = 100). Quantities are doubles
// rounded to 3 decimals so products sold by weight (kg) are supported.

export const roleEnum = pgEnum("role", ["OWNER", "MANAGER"]);
export const unitEnum = pgEnum("unit", ["PIECE", "KG"]);
export const movementTypeEnum = pgEnum("movement_type", [
  "SALE",
  "DELIVERY",
  "ADJUSTMENT",
  "VOID",
  "LOSS",
  "COUNT",
]);
export const stockCountStatusEnum = pgEnum("stock_count_status", ["IN_PROGRESS", "SUBMITTED", "APPROVED", "CANCELLED"]);
export const saleStatusEnum = pgEnum("sale_status", ["COMPLETED", "VOIDED"]);
export const cashMovementTypeEnum = pgEnum("cash_movement_type", ["IN", "OUT"]);
export const supplierEntryTypeEnum = pgEnum("supplier_entry_type", ["OPENING", "DELIVERY", "PAYMENT", "ADJUSTMENT"]);
export const expenseCategoryEnum = pgEnum("expense_category", [
  "RENT",
  "ELECTRICITY",
  "WATER",
  "SALARY",
  "PHONE_INTERNET",
  "TRANSPORT",
  "SUPPLIES",
  "MAINTENANCE",
  "TAXES",
  "OTHER",
]);
export const lossReasonEnum = pgEnum("loss_reason", ["EXPIRED", "BROKEN", "STOLEN", "DAMAGED", "OTHER"]);
export const creditEntryTypeEnum = pgEnum("credit_entry_type", ["OPENING", "SALE", "PAYMENT", "ADJUSTMENT", "VOID"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  nameFr: text("name_fr").notNull(),
  nameAr: text("name_ar").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  nameFr: text("name_fr").notNull(),
  nameAr: text("name_ar").notNull().default(""),
  barcode: text("barcode").unique(),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  unit: unitEnum("unit").notNull().default("PIECE"),
  salePrice: integer("sale_price").notNull(),
  costPrice: integer("cost_price").notNull().default(0),
  stock: doublePrecision("stock").notNull().default(0),
  minStock: doublePrecision("min_stock").notNull().default(0),
  quickKey: boolean("quick_key").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deliveries = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  reference: text("reference").notNull().default(""),
  total: integer("total").notNull(),
  note: text("note").notNull().default(""),
  userId: integer("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deliveryItems = pgTable("delivery_items", {
  id: serial("id").primaryKey(),
  deliveryId: integer("delivery_id")
    .notNull()
    .references(() => deliveries.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: doublePrecision("quantity").notNull(),
  unitCost: integer("unit_cost").notNull(),
});

export const cashSessions = pgTable("cash_sessions", {
  id: serial("id").primaryKey(),
  openedById: integer("opened_by_id").notNull().references(() => users.id),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  openingCash: integer("opening_cash").notNull(),
  closedById: integer("closed_by_id").references(() => users.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  expectedCash: integer("expected_cash"),
  countedCash: integer("counted_cash"),
  difference: integer("difference"),
  note: text("note").notNull().default(""),
});

export const cashMovements = pgTable("cash_movements", {
  id: serial("id").primaryKey(),
  cashSessionId: integer("cash_session_id")
    .notNull()
    .references(() => cashSessions.id),
  type: cashMovementTypeEnum("type").notNull(),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  userId: integer("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Customers who buy on credit (the "karné").
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  note: text("note").notNull().default(""),
  // Maximum balance allowed, 0 = no limit.
  creditLimit: integer("credit_limit").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sales = pgTable(
  "sales",
  {
    // Generated on the POS so a sale made offline can be synced exactly once.
    id: uuid("id").primaryKey(),
    number: serial("number").notNull(),
    cashSessionId: integer("cash_session_id")
      .notNull()
      .references(() => cashSessions.id),
    userId: integer("user_id").notNull().references(() => users.id),
    total: integer("total").notNull(),
    paid: integer("paid").notNull(),
    change: integer("change").notNull(),
    customerId: integer("customer_id").references(() => customers.id),
    // Part of the total put on the customer's credit instead of paid in cash.
    creditAmount: integer("credit_amount").notNull().default(0),
    status: saleStatusEnum("status").notNull().default("COMPLETED"),
    voidedById: integer("voided_by_id").references(() => users.id),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sales_created_at_idx").on(t.createdAt)],
);

export const saleItems = pgTable("sale_items", {
  id: serial("id").primaryKey(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  name: text("name").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  unitCost: integer("unit_cost").notNull(),
  lineTotal: integer("line_total").notNull(),
});

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    type: movementTypeEnum("type").notNull(),
    // Signed: positive adds stock, negative removes it.
    quantity: doublePrecision("quantity").notNull(),
    stockAfter: doublePrecision("stock_after").notNull(),
    reference: text("reference").notNull().default(""),
    note: text("note").notNull().default(""),
    userId: integer("user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stock_movements_product_idx").on(t.productId)],
);

// The customer's credit ledger. Entries are never edited or deleted; the
// balance is the sum of amounts (positive = customer owes more).
export const creditEntries = pgTable(
  "credit_entries",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    type: creditEntryTypeEnum("type").notNull(),
    amount: integer("amount").notNull(),
    saleId: uuid("sale_id").references(() => sales.id),
    // Set for cash payments so they count in that register's expected cash.
    cashSessionId: integer("cash_session_id").references(() => cashSessions.id),
    note: text("note").notNull().default(""),
    userId: integer("user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("credit_entries_customer_idx").on(t.customerId)],
);

// What the shop owes each supplier. Entries are never edited or deleted; the
// balance is the sum of amounts (positive = the shop owes more).
export const supplierEntries = pgTable(
  "supplier_entries",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    type: supplierEntryTypeEnum("type").notNull(),
    amount: integer("amount").notNull(),
    deliveryId: integer("delivery_id").references(() => deliveries.id),
    // Set when a payment was taken from the drawer: it lowers that register's expected cash.
    cashSessionId: integer("cash_session_id").references(() => cashSessions.id),
    note: text("note").notNull().default(""),
    userId: integer("user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("supplier_entries_supplier_idx").on(t.supplierId)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    category: expenseCategoryEnum("category").notNull(),
    amount: integer("amount").notNull(),
    note: text("note").notNull().default(""),
    // The day the expense belongs to (e.g. the month's rent), in Morocco time.
    date: date("date", { mode: "string" }).notNull(),
    // Set when paid from the drawer: it lowers that register's expected cash.
    cashSessionId: integer("cash_session_id").references(() => cashSessions.id),
    userId: integer("user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("expenses_date_idx").on(t.date)],
);

// Goods thrown away or missing. Valued at the purchase price at the time.
export const losses = pgTable(
  "losses",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    quantity: doublePrecision("quantity").notNull(),
    unitCost: integer("unit_cost").notNull(),
    reason: lossReasonEnum("reason").notNull(),
    note: text("note").notNull().default(""),
    userId: integer("user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("losses_created_at_idx").on(t.createdAt)],
);

// Expiry dates of received goods. How much of a batch is still on the shelf is
// estimated from the product's stock (the latest-expiring batches are assumed
// unsold), so sales never need to pick a batch.
export const productBatches = pgTable(
  "product_batches",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    quantity: doublePrecision("quantity").notNull(),
    expiryDate: date("expiry_date", { mode: "string" }).notNull(),
    deliveryId: integer("delivery_id").references(() => deliveries.id),
    // Set when someone confirms the batch is no longer on the shelf.
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    userId: integer("user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("product_batches_product_idx").on(t.productId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    action: text("action").notNull(),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_at_idx").on(t.createdAt)],
);

// Physical stock counts (inventaire). Counting is blind for managers; the
// owner reviews the differences before stock is corrected.
export const stockCounts = pgTable("stock_counts", {
  id: serial("id").primaryKey(),
  status: stockCountStatusEnum("status").notNull().default("IN_PROGRESS"),
  // Null = every active product.
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  note: text("note").notNull().default(""),
  startedById: integer("started_by_id").notNull().references(() => users.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  submittedById: integer("submitted_by_id").references(() => users.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  closedById: integer("closed_by_id").references(() => users.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const stockCountLines = pgTable(
  "stock_count_lines",
  {
    id: serial("id").primaryKey(),
    countId: integer("count_id")
      .notNull()
      .references(() => stockCounts.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    counted: doublePrecision("counted").notNull(),
    // System stock when the product was counted: sales made afterwards
    // don't count as a difference.
    expected: doublePrecision("expected").notNull(),
    unitCost: integer("unit_cost").notNull(),
    // Set when the count is approved: the correction actually applied.
    applied: doublePrecision("applied"),
    userId: integer("user_id").notNull().references(() => users.id),
    countedAt: timestamp("counted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stock_count_lines_count_product_idx").on(t.countId, t.productId)],
);

// Phones and browsers that receive the owner's alerts (Web Push).
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  device: text("device").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Which alerts each owner wants. Kinds are opt-out, so new kinds start enabled.
export const alertSettings = pgTable("alert_settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  muted: text("muted").array().notNull().default(sql`'{login}'::text[]`),
  // A cash closing with a difference at least this large is flagged.
  cashThreshold: integer("cash_threshold").notNull().default(1000),
  locale: text("locale").notNull().default("fr"),
});

// Small server-side values: push keys, how far the alert worker has read.
export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type CashSession = typeof cashSessions.$inferSelect;
