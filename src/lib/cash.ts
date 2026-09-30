import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashMovements, cashSessions, creditEntries, expenses, sales, supplierEntries, users } from "@/db/schema";

export async function getOpenCashSession() {
  const [row] = await db
    .select({ session: cashSessions, openedByName: users.name })
    .from(cashSessions)
    .innerJoin(users, eq(users.id, cashSessions.openedById))
    .where(isNull(cashSessions.closedAt))
    .orderBy(desc(cashSessions.openedAt))
    .limit(1);
  return row ? { ...row.session, openedByName: row.openedByName } : null;
}

/**
 * Cash that should be in the drawer: opening + cash part of sales + credit
 * repayments + money in − money out − supplier payments and expenses paid
 * from the drawer.
 */
export async function cashSummary(sessionId: number, openingCash: number) {
  const [s] = await db
    .select({
      cash: sql<number>`coalesce(sum(${sales.total} - ${sales.creditAmount}), 0)::int`,
      credit: sql<number>`coalesce(sum(${sales.creditAmount}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(sales)
    .where(and(eq(sales.cashSessionId, sessionId), eq(sales.status, "COMPLETED")));
  const [m] = await db
    .select({
      cashIn: sql<number>`coalesce(sum(case when ${cashMovements.type} = 'IN' then ${cashMovements.amount} end), 0)::int`,
      cashOut: sql<number>`coalesce(sum(case when ${cashMovements.type} = 'OUT' then ${cashMovements.amount} end), 0)::int`,
    })
    .from(cashMovements)
    .where(eq(cashMovements.cashSessionId, sessionId));
  const [p] = await db
    .select({ total: sql<number>`coalesce(-sum(${creditEntries.amount}), 0)::int` })
    .from(creditEntries)
    .where(and(eq(creditEntries.cashSessionId, sessionId), eq(creditEntries.type, "PAYMENT")));
  const [sp] = await db
    .select({ total: sql<number>`coalesce(-sum(${supplierEntries.amount}), 0)::int` })
    .from(supplierEntries)
    .where(and(eq(supplierEntries.cashSessionId, sessionId), eq(supplierEntries.type, "PAYMENT")));
  const [ex] = await db
    .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)::int` })
    .from(expenses)
    .where(eq(expenses.cashSessionId, sessionId));
  return {
    salesTotal: s.cash,
    salesCount: s.count,
    creditSales: s.credit,
    creditPayments: p.total,
    cashIn: m.cashIn,
    cashOut: m.cashOut,
    supplierPayments: sp.total,
    expenses: ex.total,
    expected: openingCash + s.cash + p.total + m.cashIn - m.cashOut - sp.total - ex.total,
  };
}
