import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { productBatches, products, type Product } from "@/db/schema";
import { roundQty, todayInMorocco } from "./format";

export type Batch = typeof productBatches.$inferSelect & {
  product: Pick<Product, "id" | "nameFr" | "nameAr" | "unit" | "stock">;
  remaining: number;
  daysLeft: number;
};

// Batches expiring within this many days are shown as "soon".
export const SOON_DAYS = 7;
export const WATCH_DAYS = 30;

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400_000);
}

/**
 * Open batches with the quantity estimated to be still on the shelf. The
 * product's current stock is attributed to the batches that expire last
 * (goods are sold oldest first), so earlier batches are considered sold out.
 * Ordering by expiry rather than by entry date keeps dates entered later for
 * stock already on the shelf in their right place.
 */
export async function openBatches(productId?: number): Promise<Batch[]> {
  const rows = await db
    .select({
      b: productBatches,
      p: { id: products.id, nameFr: products.nameFr, nameAr: products.nameAr, unit: products.unit, stock: products.stock },
    })
    .from(productBatches)
    .innerJoin(products, eq(products.id, productBatches.productId))
    .where(and(isNull(productBatches.clearedAt), productId ? eq(productBatches.productId, productId) : undefined))
    .orderBy(desc(productBatches.expiryDate), desc(productBatches.createdAt), desc(productBatches.id));

  const today = todayInMorocco();
  const left = new Map<number, number>();
  return rows.map(({ b, p }) => {
    const available = left.get(p.id) ?? Math.max(p.stock, 0);
    const remaining = roundQty(Math.min(b.quantity, available));
    left.set(p.id, roundQty(available - remaining));
    return { ...b, product: p, remaining, daysLeft: daysBetween(today, b.expiryDate) };
  });
}

/** Batches still on the shelf that expire within `days` (or already expired), soonest first. */
export async function expiringBatches(days = WATCH_DAYS) {
  return (await openBatches())
    .filter((b) => b.remaining > 0 && b.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
