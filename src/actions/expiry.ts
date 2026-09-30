"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { productBatches, products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { roundQty } from "@/lib/format";

type State = { error?: string; ok?: boolean } | undefined;

function revalidate(productId: number) {
  revalidatePath("/expiry");
  revalidatePath(`/products/${productId}`);
  revalidatePath("/dashboard");
}

/** Records the expiry date of stock already on the shelf. Does not change stock. */
export async function addBatch(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const productId = Number(formData.get("productId"));
  const quantity = roundQty(parseFloat(String(formData.get("quantity") ?? "").replace(",", ".")));
  const expiryDate = String(formData.get("expiryDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) return { error: "required" };
  if (!(quantity > 0)) return { error: "quantity" };
  const [p] = await db.select({ nameFr: products.nameFr }).from(products).where(eq(products.id, productId));
  if (!p) return { error: "generic" };
  await db.transaction(async (tx) => {
    await tx.insert(productBatches).values({ productId, quantity, expiryDate, userId: user.id });
    await audit(user.id, "batch_create", { productId, name: p.nameFr, quantity, expiryDate }, tx);
  });
  revalidate(productId);
  return { ok: true };
}

/** Marks a batch as no longer on the shelf, so it stops raising alerts. */
export async function clearBatch(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const [b] = await db
    .update(productBatches)
    .set({ clearedAt: new Date() })
    .where(and(eq(productBatches.id, id), isNull(productBatches.clearedAt)))
    .returning();
  if (b) {
    const [p] = await db.select({ nameFr: products.nameFr }).from(products).where(eq(products.id, b.productId));
    await audit(user.id, "batch_clear", { productId: b.productId, name: p?.nameFr, expiryDate: b.expiryDate });
    revalidate(b.productId);
  }
  return { ok: true };
}
