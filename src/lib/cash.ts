import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashMovements, cashSessions, sales, users } from "@/db/schema";

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

/** Cash that should be in the drawer: opening + cash sales + money in − money out. */
export async function cashSummary(sessionId: number, openingCash: number) {
  const [s] = await db
    .select({
      total: sql<number>`coalesce(sum(${sales.total}), 0)::int`,
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
  return {
    salesTotal: s.total,
    salesCount: s.count,
    cashIn: m.cashIn,
    cashOut: m.cashOut,
    expected: openingCash + s.total + m.cashIn - m.cashOut,
  };
}
