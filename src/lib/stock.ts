import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { products, stockMovements } from "@/db/schema";
import { roundQty } from "./format";

/** Changes a product's stock and records why. `delta` is signed. */
export async function moveStock(
  tx: Tx,
  opts: {
    productId: number;
    delta: number;
    type: "SALE" | "DELIVERY" | "ADJUSTMENT" | "VOID";
    userId: number | null;
    reference?: string;
    note?: string;
  },
) {
  const delta = roundQty(opts.delta);
  const [row] = await tx
    .update(products)
    .set({ stock: sql`round((${products.stock} + ${delta})::numeric, 3)::float8`, updatedAt: new Date() })
    .where(eq(products.id, opts.productId))
    .returning({ stock: products.stock });
  if (!row) throw new Error(`Product ${opts.productId} not found`);
  await tx.insert(stockMovements).values({
    productId: opts.productId,
    type: opts.type,
    quantity: delta,
    stockAfter: row.stock,
    reference: opts.reference ?? "",
    note: opts.note ?? "",
    userId: opts.userId,
  });
  return row.stock;
}
