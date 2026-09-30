"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { deliveries, deliveryItems, products, suppliers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { moveStock } from "@/lib/stock";
import { roundQty } from "@/lib/format";

type State = { error?: string; ok?: boolean } | undefined;

export async function createSupplier(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "required" };
  const [s] = await db
    .insert(suppliers)
    .values({ name, phone: String(formData.get("phone") ?? "").trim() })
    .returning();
  await audit(user.id, "supplier_create", { supplierId: s.id, name });
  revalidatePath("/suppliers");
  revalidatePath("/deliveries/new");
  return { ok: true };
}

const deliveryInput = z.object({
  supplierId: z.number().int().nullable(),
  reference: z.string().max(200),
  note: z.string().max(1000),
  items: z
    .array(
      z.object({
        productId: z.number().int(),
        quantity: z.number().positive(),
        unitCost: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export async function createDelivery(input: z.infer<typeof deliveryInput>): Promise<{ error?: string; id?: number }> {
  const user = await requireUser();
  const parsed = deliveryInput.safeParse(input);
  if (!parsed.success) return { error: "emptyItems" };
  const { supplierId, reference, note, items } = parsed.data;
  const total = items.reduce((s, i) => s + Math.round(i.unitCost * i.quantity), 0);

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
    }
    await audit(user.id, "delivery_create", { deliveryId: d.id, supplierId, total, items: items.length }, tx);
    return d.id;
  });

  revalidatePath("/deliveries");
  revalidatePath("/products");
  return { id };
}
