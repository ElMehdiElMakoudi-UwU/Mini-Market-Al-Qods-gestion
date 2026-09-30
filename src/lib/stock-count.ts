import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { products, stockCountLines, stockCounts } from "@/db/schema";
import { audit } from "./audit";
import { moveStock } from "./stock";
import { roundQty } from "./format";

export const OPEN_COUNT = ["IN_PROGRESS", "SUBMITTED"] as const;

/** Records what is on the shelf for one product, replacing an earlier count of it. */
export async function recordCountLine(countId: number, productId: number, counted: number, userId: number) {
  if (!Number.isFinite(counted) || counted < 0) return { error: "amount" } as const;
  const [count] = await db.select().from(stockCounts).where(eq(stockCounts.id, countId));
  if (!count || count.status !== "IN_PROGRESS") return { error: "countClosed" } as const;
  const [p] = await db.select().from(products).where(eq(products.id, productId));
  if (!p || !p.active || (count.categoryId && p.categoryId !== count.categoryId)) return { error: "notInCount" } as const;
  const values = { counted: roundQty(counted), expected: p.stock, unitCost: p.costPrice, userId, countedAt: new Date() };
  await db
    .insert(stockCountLines)
    .values({ countId, productId, ...values })
    .onConflictDoUpdate({ target: [stockCountLines.countId, stockCountLines.productId], set: values });
  return { ok: true, counted: values.counted, expected: p.stock } as const;
}

/**
 * Corrects stock by each counted difference, applied to today's stock so
 * sales made after a product was counted are kept. Uncounted products are
 * left as they are. Returns false if the count was no longer open.
 */
export async function approveStockCount(countId: number, userId: number) {
  return db.transaction(async (tx) => {
    const [c] = await tx
      .update(stockCounts)
      .set({ status: "APPROVED", closedById: userId, closedAt: new Date() })
      .where(and(eq(stockCounts.id, countId), inArray(stockCounts.status, [...OPEN_COUNT])))
      .returning();
    if (!c) return false;
    const lines = await tx.select().from(stockCountLines).where(eq(stockCountLines.countId, countId));
    let differences = 0;
    let value = 0;
    for (const l of lines) {
      const delta = roundQty(l.counted - l.expected);
      await tx.update(stockCountLines).set({ applied: delta }).where(eq(stockCountLines.id, l.id));
      if (delta === 0) continue;
      differences++;
      value += Math.round(delta * l.unitCost);
      await moveStock(tx, { productId: l.productId, delta, type: "COUNT", userId, reference: `#${countId}` });
    }
    await audit(userId, "stock_count_approve", { countId, number: countId, lines: lines.length, differences, ...(value ? { amount: value } : {}) }, tx);
    return true;
  });
}
