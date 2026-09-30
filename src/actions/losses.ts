"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lossReasonEnum, losses, products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { moveStock } from "@/lib/stock";
import { roundQty } from "@/lib/format";

type State = { error?: string; ok?: boolean } | undefined;
type Reason = (typeof lossReasonEnum.enumValues)[number];

/** Removes broken, expired or missing goods from stock, valued at purchase price. */
export async function recordLoss(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const productId = Number(formData.get("productId"));
  const quantity = roundQty(parseFloat(String(formData.get("quantity") ?? "").replace(",", ".")));
  const reason = String(formData.get("reason") ?? "") as Reason;
  const note = String(formData.get("note") ?? "").trim();
  if (!productId) return { error: "required" };
  if (!(quantity > 0)) return { error: "quantity" };
  if (!lossReasonEnum.enumValues.includes(reason)) return { error: "required" };
  if (reason === "OTHER" && !note) return { error: "reason" };

  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(products).where(eq(products.id, productId));
    if (!p) throw new Error("not found");
    const [l] = await tx
      .insert(losses)
      .values({ productId, quantity, unitCost: p.costPrice, reason, note, userId: user.id })
      .returning({ id: losses.id });
    await moveStock(tx, { productId, delta: -quantity, type: "LOSS", userId: user.id, reference: `P${l.id}`, note });
    await audit(
      user.id,
      "loss_create",
      { lossId: l.id, productId, name: p.nameFr, quantity, total: Math.round(p.costPrice * quantity), lossReason: reason, reason: note || undefined },
      tx,
    );
  });
  revalidatePath("/losses");
  revalidatePath("/products", "layout");
  revalidatePath("/dashboard");
  return { ok: true };
}
