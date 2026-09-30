"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { deliveries, deliveryItems, productBatches, products, supplierEntries } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getOpenCashSession } from "@/lib/cash";
import { moveStock } from "@/lib/stock";
import { roundQty } from "@/lib/format";

const deliveryInput = z.object({
  supplierId: z.number().int().nullable(),
  reference: z.string().max(200),
  note: z.string().max(1000),
  // Paid to the supplier now; the rest becomes a debt. Only with a supplier.
  paid: z.number().int().nonnegative().default(0),
  fromCash: z.boolean().default(true),
  items: z
    .array(
      z.object({
        productId: z.number().int(),
        quantity: z.number().positive(),
        unitCost: z.number().int().nonnegative(),
        expiryDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullish(),
      }),
    )
    .min(1),
});

export async function createDelivery(input: z.infer<typeof deliveryInput>): Promise<{ error?: string; id?: number }> {
  const user = await requireUser();
  const parsed = deliveryInput.safeParse(input);
  if (!parsed.success) return { error: "emptyItems" };
  const { supplierId, reference, note, items, fromCash } = parsed.data;
  const total = items.reduce((s, i) => s + Math.round(i.unitCost * i.quantity), 0);
  const paid = supplierId ? parsed.data.paid : 0;
  if (paid > total) return { error: "amount" };
  if (paid > 0 && !fromCash && user.role !== "OWNER") return { error: "forbidden" };
  const session = paid > 0 && fromCash ? await getOpenCashSession() : null;
  if (paid > 0 && fromCash && !session) return { error: "closed" };

  const id = await db.transaction(async (tx) => {
    const [d] = await tx
      .insert(deliveries)
      .values({ supplierId, reference: reference.trim(), note: note.trim(), total, userId: user.id })
      .returning({ id: deliveries.id });
    await tx.insert(deliveryItems).values(
      items.map((i) => ({ deliveryId: d.id, productId: i.productId, quantity: roundQty(i.quantity), unitCost: i.unitCost })),
    );
    for (const i of items) {
      await moveStock(tx, {
        productId: i.productId,
        delta: i.quantity,
        type: "DELIVERY",
        userId: user.id,
        reference: `R${d.id}`,
      });
      // The latest purchase price becomes the product's cost, used for margins.
      if (i.unitCost > 0) await tx.update(products).set({ costPrice: i.unitCost }).where(eq(products.id, i.productId));
      if (i.expiryDate) {
        await tx.insert(productBatches).values({
          productId: i.productId,
          quantity: roundQty(i.quantity),
          expiryDate: i.expiryDate,
          deliveryId: d.id,
          userId: user.id,
        });
      }
    }
    if (supplierId) {
      await tx.insert(supplierEntries).values({ supplierId, type: "DELIVERY", amount: total, deliveryId: d.id, userId: user.id });
      if (paid > 0) {
        await tx.insert(supplierEntries).values({
          supplierId,
          type: "PAYMENT",
          amount: -paid,
          deliveryId: d.id,
          cashSessionId: session?.id ?? null,
          userId: user.id,
        });
      }
    }
    await audit(user.id, "delivery_create", { deliveryId: d.id, supplierId, total, paid, fromCash, items: items.length }, tx);
    return d.id;
  });

  revalidatePath("/deliveries");
  revalidatePath("/suppliers", "layout");
  revalidatePath("/cash");
  revalidatePath("/expiry");
  revalidatePath("/products");
  return { id };
}
