import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditEntries, customers } from "@/db/schema";

export const balanceSql = sql<number>`coalesce(sum(${creditEntries.amount}), 0)::int`;

/** Active and inactive customers with their current balance. */
export async function customersWithBalance() {
  return db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      note: customers.note,
      creditLimit: customers.creditLimit,
      active: customers.active,
      balance: balanceSql,
      lastEntryAt: sql<Date | null>`max(${creditEntries.createdAt})`,
    })
    .from(customers)
    .leftJoin(creditEntries, eq(creditEntries.customerId, customers.id))
    .groupBy(customers.id)
    .orderBy(asc(customers.name));
}

export async function customerBalance(customerId: number) {
  const [row] = await db.select({ balance: balanceSql }).from(creditEntries).where(eq(creditEntries.customerId, customerId));
  return row.balance;
}
