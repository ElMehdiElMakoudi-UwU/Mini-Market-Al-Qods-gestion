"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { creditEntries, customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getOpenCashSession } from "@/lib/cash";
import { customerBalance } from "@/lib/credit";
import { toCents } from "@/lib/format";

type State = { error?: string; ok?: boolean; id?: number } | undefined;

function readAmount(formData: FormData, key: string, allowEmpty = false) {
  const raw = String(formData.get(key) ?? "").trim();
  if (allowEmpty && raw === "") return 0;
  return toCents(raw);
}

function revalidate(customerId?: number) {
  revalidatePath("/customers");
  if (customerId) revalidatePath(`/customers/${customerId}`);
  revalidatePath("/cash");
}

export async function saveCustomer(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const isOwner = user.role === "OWNER";
  const id = Number(formData.get("id")) || null;
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!name) return { error: "required" };

  // Only the owner decides how much credit a customer may take.
  const creditLimit = isOwner ? readAmount(formData, "creditLimit", true) : undefined;
  if (creditLimit !== undefined && (!Number.isFinite(creditLimit) || creditLimit < 0)) return { error: "amount" };

  if (id) {
    const [before] = await db.select().from(customers).where(eq(customers.id, id));
    if (!before) return { error: "generic" };
    const active = formData.get("active") === "on";
    await db
      .update(customers)
      .set({ name, phone, note, active, ...(creditLimit !== undefined ? { creditLimit } : {}) })
      .where(eq(customers.id, id));
    await audit(user.id, "customer_update", {
      customerId: id,
      name,
      active,
      ...(creditLimit !== undefined && creditLimit !== before.creditLimit ? { creditLimit: [before.creditLimit, creditLimit] } : {}),
    });
    revalidate(id);
    return { ok: true, id };
  }

  // Balance carried over from the paper karné.
  const opening = readAmount(formData, "openingBalance", true);
  if (!Number.isFinite(opening) || opening < 0) return { error: "amount" };
  const newId = await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(customers)
      .values({ name, phone, note, creditLimit: creditLimit ?? 0 })
      .returning({ id: customers.id });
    if (opening > 0) {
      await tx.insert(creditEntries).values({ customerId: c.id, type: "OPENING", amount: opening, userId: user.id });
    }
    await audit(user.id, "customer_create", { customerId: c.id, name, ...(opening > 0 ? { total: opening } : {}) }, tx);
    return c.id;
  });
  revalidate();
  return { ok: true, id: newId };
}

/** A customer pays back part of their credit, in cash, into the open register. */
export async function recordPayment(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const customerId = Number(formData.get("customerId"));
  const amount = readAmount(formData, "amount");
  const note = String(formData.get("note") ?? "").trim();
  if (!Number.isFinite(amount) || amount <= 0) return { error: "amount" };
  const session = await getOpenCashSession();
  if (!session) return { error: "closed" };
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer) return { error: "generic" };
  const balance = await customerBalance(customerId);
  if (amount > balance) return { error: "overpay" };

  await db.transaction(async (tx) => {
    await tx.insert(creditEntries).values({
      customerId,
      type: "PAYMENT",
      amount: -amount,
      cashSessionId: session.id,
      note,
      userId: user.id,
    });
    await audit(user.id, "credit_payment", { customerId, name: customer.name, total: amount }, tx);
  });
  revalidate(customerId);
  return { ok: true };
}

/** Owner-only correction: a mistake in the karné, or a debt that is forgiven. */
export async function adjustCredit(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  if (user.role !== "OWNER") return { error: "forbidden" };
  const customerId = Number(formData.get("customerId"));
  const amount = readAmount(formData, "amount");
  const sign = formData.get("direction") === "increase" ? 1 : -1;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!Number.isFinite(amount) || amount <= 0) return { error: "amount" };
  if (!reason) return { error: "reason" };
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer) return { error: "generic" };

  await db.transaction(async (tx) => {
    await tx.insert(creditEntries).values({ customerId, type: "ADJUSTMENT", amount: sign * amount, note: reason, userId: user.id });
    await audit(user.id, "credit_adjust", { customerId, name: customer.name, amount: sign * amount, reason }, tx);
  });
  revalidate(customerId);
  return { ok: true };
}
