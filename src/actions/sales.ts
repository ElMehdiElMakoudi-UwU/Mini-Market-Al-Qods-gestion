"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditEntries, saleItems, sales } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { moveStock } from "@/lib/stock";

type State = { error?: string; ok?: boolean } | undefined;

export async function voidSale(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  if (user.role !== "OWNER") return { error: "forbidden" };
  const saleId = String(formData.get("saleId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "reason" };

  await db.transaction(async (tx) => {
    const [sale] = await tx
      .update(sales)
      .set({ status: "VOIDED", voidedById: user.id, voidReason: reason })
      .where(and(eq(sales.id, saleId), eq(sales.status, "COMPLETED")))
      .returning();
    if (!sale) return;
    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId));
    for (const i of items) {
      await moveStock(tx, { productId: i.productId, delta: i.quantity, type: "VOID", userId: user.id, reference: `#${sale.number}`, note: reason });
    }
    if (sale.customerId && sale.creditAmount > 0) {
      await tx.insert(creditEntries).values({
        customerId: sale.customerId,
        type: "VOID",
        amount: -sale.creditAmount,
        saleId,
        userId: user.id,
        note: reason,
      });
    }
    await audit(user.id, "sale_void", { saleId, number: sale.number, total: sale.total, reason }, tx);
  });
  revalidatePath("/sales");
  revalidatePath("/customers", "layout");
  return { ok: true };
}
