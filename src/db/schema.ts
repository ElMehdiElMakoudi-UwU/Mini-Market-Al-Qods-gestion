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
} from "drizzle-orm/pg-core";

// Money is stored as integer centimes (1 MAD = 100). Quantities are doubles
// rounded to 3 decimals so products sold by weight (kg) are supported.

export const roleEnum = pgEnum("role", ["OWNER", "MANAGER"]);
export const unitEnum = pgEnum("unit", ["PIECE", "KG"]);
export const movementTypeEnum = pgEnum("movement_type", [
  "SALE",
  "DELIVERY",
  "ADJUSTMENT",
  "VOID",
]);
export const saleStatusEnum = pgEnum("sale_status", ["COMPLETED", "VOIDED"]);
export const cashMovementTypeEnum = pgEnum("cash_movement_type", ["IN", "OUT"]);
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

export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type CashSession = typeof cashSessions.$inferSelect;
