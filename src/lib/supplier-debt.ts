import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { supplierEntries, suppliers } from "@/db/schema";

const balanceSql = sql<number>`coalesce(sum(${supplierEntries.amount}), 0)::int`;

/** Suppliers with what the shop currently owes them. */
export async function suppliersWithBalance() {
  return db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      phone: suppliers.phone,
      balance: balanceSql,
      lastEntryAt: sql<Date | null>`max(${supplierEntries.createdAt})`,
    })
    .from(suppliers)
    .leftJoin(supplierEntries, eq(supplierEntries.supplierId, suppliers.id))
    .groupBy(suppliers.id)
    .orderBy(asc(suppliers.name));
}

export async function supplierBalance(supplierId: number) {
  const [row] = await db.select({ balance: balanceSql }).from(supplierEntries).where(eq(supplierEntries.supplierId, supplierId));
  return row.balance;
}
