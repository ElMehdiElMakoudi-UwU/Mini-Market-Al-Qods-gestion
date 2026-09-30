"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { supplierEntries, suppliers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getOpenCashSession } from "@/lib/cash";
import { supplierBalance } from "@/lib/supplier-debt";
import { toCents } from "@/lib/format";

type State = { error?: string; ok?: boolean } | undefined;

function readAmount(formData: FormData, key: string, allowEmpty = false) {
  const raw = String(formData.get(key) ?? "").trim();
  if (allowEmpty && raw === "") return 0;
  return toCents(raw);
}

function revalidate(supplierId?: number) {
  revalidatePath("/suppliers");
  if (supplierId) revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/deliveries/new");
  revalidatePath("/cash");
}

export async function saveSupplier(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const id = Number(formData.get("id")) || null;
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name) return { error: "required" };

  if (id) {
    await db.update(suppliers).set({ name, phone }).where(eq(suppliers.id, id));
    await audit(user.id, "supplier_update", { supplierId: id, name });
    revalidate(id);
    return { ok: true };
  }

  // A debt carried over from before the app. Owner only: a manager could
  // otherwise inflate a debt and then "pay" it out of the drawer.
  const opening = user.role === "OWNER" ? readAmount(formData, "openingBalance", true) : 0;
  if (!Number.isFinite(opening) || opening < 0) return { error: "amount" };
  await db.transaction(async (tx) => {
    const [s] = await tx.insert(suppliers).values({ name, phone }).returning({ id: suppliers.id });
    if (opening > 0) {
      await tx.insert(supplierEntries).values({ supplierId: s.id, type: "OPENING", amount: opening, userId: user.id });
    }
    await audit(user.id, "supplier_create", { supplierId: s.id, name, ...(opening > 0 ? { total: opening } : {}) }, tx);
  });
  revalidate();
  return { ok: true };
}

/** Pays part of what the shop owes a supplier, from the drawer or (owner only) from outside it. */
export async function paySupplier(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const supplierId = Number(formData.get("supplierId"));
  const amount = readAmount(formData, "amount");
  const fromCash = formData.get("source") !== "outside";
  const note = String(formData.get("note") ?? "").trim();
  if (!Number.isFinite(amount) || amount <= 0) return { error: "amount" };
  if (!fromCash && user.role !== "OWNER") return { error: "forbidden" };
  const session = fromCash ? await getOpenCashSession() : null;
  if (fromCash && !session) return { error: "closed" };
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
  if (!supplier) return { error: "generic" };
  if (amount > (await supplierBalance(supplierId))) return { error: "overpaySupplier" };

  await db.transaction(async (tx) => {
    await tx.insert(supplierEntries).values({
      supplierId,
      type: "PAYMENT",
      amount: -amount,
      cashSessionId: session?.id ?? null,
      note,
      userId: user.id,
    });
    await audit(user.id, "supplier_payment", { supplierId, name: supplier.name, total: amount, fromCash }, tx);
  });
  revalidate(supplierId);
  return { ok: true };
}

/** Owner-only correction of what the shop owes a supplier. */
export async function adjustSupplier(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  if (user.role !== "OWNER") return { error: "forbidden" };
  const supplierId = Number(formData.get("supplierId"));
  const amount = readAmount(formData, "amount");
  const sign = formData.get("direction") === "increase" ? 1 : -1;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!Number.isFinite(amount) || amount <= 0) return { error: "amount" };
  if (!reason) return { error: "reason" };
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
  if (!supplier) return { error: "generic" };

  await db.transaction(async (tx) => {
    await tx.insert(supplierEntries).values({ supplierId, type: "ADJUSTMENT", amount: sign * amount, note: reason, userId: user.id });
    await audit(user.id, "supplier_adjust", { supplierId, name: supplier.name, amount: sign * amount, reason }, tx);
  });
  revalidate(supplierId);
  return { ok: true };
}
