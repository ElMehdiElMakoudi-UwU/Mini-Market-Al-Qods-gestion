import "server-only";
import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cashSessions, creditEntries, customers, products, saleItems, sales } from "@/db/schema";
import { moveStock } from "./stock";
import { roundQty } from "./format";

export const saleInput = z.object({
  id: z.string().uuid(),
  cashSessionId: z.number().int(),
  createdAt: z.string(),
  paid: z.number().int().nonnegative(),
  // When set, whatever is not paid in cash goes on this customer's credit.
  customerId: z.number().int().nullish(),
  items: z
    .array(
      z.object({
        productId: z.number().int(),
        quantity: z.number().positive(),
        unitPrice: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});
export type SaleInput = z.infer<typeof saleInput>;

/**
 * Records a sale coming from the POS. Idempotent on the client-generated id,
 * so retrying a sync after a dropped connection never double-counts.
 * Returns the sale number.
 */
export async function recordSale(input: SaleInput, userId: number): Promise<number> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ number: sales.number }).from(sales).where(eq(sales.id, input.id));
    if (existing) return existing.number;

    // A sale made offline must never be lost: if its register session is
    // unknown, attach it to the most recent one.
    let [session] = await tx.select({ id: cashSessions.id }).from(cashSessions).where(eq(cashSessions.id, input.cashSessionId));
    if (!session) {
      [session] = await tx.select({ id: cashSessions.id }).from(cashSessions).orderBy(desc(cashSessions.openedAt)).limit(1);
      if (!session) throw new Error("No cash session");
    }

    const ids = [...new Set(input.items.map((i) => i.productId))];
    const rows = await tx.select().from(products).where(inArray(products.id, ids));
    const byId = new Map(rows.map((p) => [p.id, p]));

    const lines = input.items.map((i) => {
      const p = byId.get(i.productId);
      if (!p) throw new Error(`Unknown product ${i.productId}`);
      const quantity = roundQty(i.quantity);
      return {
        product: p,
        quantity,
        unitPrice: i.unitPrice,
        lineTotal: Math.round(i.unitPrice * quantity),
      };
    });
    const total = lines.reduce((s, l) => s + l.lineTotal, 0);
    const createdAt = new Date(input.createdAt);
    const saleDate = isNaN(createdAt.getTime()) ? new Date() : createdAt;

    let customerId: number | null = null;
    if (input.customerId) {
      const [c] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId));
      if (!c) throw new Error(`Unknown customer ${input.customerId}`);
      customerId = c.id;
    }
    const creditAmount = customerId ? Math.max(total - input.paid, 0) : 0;

    const [sale] = await tx
      .insert(sales)
      .values({
        id: input.id,
        cashSessionId: session.id,
        userId,
        total,
        paid: customerId ? input.paid : Math.max(input.paid, total),
        change: Math.max(input.paid - total, 0),
        customerId,
        creditAmount,
        createdAt: saleDate,
      })
      .returning({ number: sales.number });

    await tx.insert(saleItems).values(
      lines.map((l) => ({
        saleId: input.id,
        productId: l.product.id,
        name: l.product.nameFr,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        unitCost: l.product.costPrice,
        lineTotal: l.lineTotal,
      })),
    );
    if (customerId && creditAmount > 0) {
      await tx.insert(creditEntries).values({
        customerId,
        type: "SALE",
        amount: creditAmount,
        saleId: input.id,
        userId,
        createdAt: saleDate,
      });
    }
    for (const l of lines) {
      await moveStock(tx, {
        productId: l.product.id,
        delta: -l.quantity,
        type: "SALE",
        userId,
        reference: `#${sale.number}`,
      });
    }
    return sale.number;
  });
}
