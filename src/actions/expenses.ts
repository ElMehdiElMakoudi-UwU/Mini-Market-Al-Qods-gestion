"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { expenseCategoryEnum, expenses } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getOpenCashSession } from "@/lib/cash";
import { toCents, todayInMorocco } from "@/lib/format";

type State = { error?: string; ok?: boolean } | undefined;
type Category = (typeof expenseCategoryEnum.enumValues)[number];

function revalidate() {
  revalidatePath("/expenses");
  revalidatePath("/cash");
  revalidatePath("/dashboard");
}

export async function createExpense(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const category = String(formData.get("category") ?? "") as Category;
  const amount = toCents(String(formData.get("amount") ?? ""));
  const note = String(formData.get("note") ?? "").trim();
  const rawDate = String(formData.get("date") ?? "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayInMorocco();
  // Managers can only spend from the drawer, where the closing count checks it.
  const fromCash = user.role !== "OWNER" || formData.get("source") !== "outside";
  if (!expenseCategoryEnum.enumValues.includes(category)) return { error: "required" };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "amount" };
  if (category === "OTHER" && !note) return { error: "reason" };
  const session = fromCash ? await getOpenCashSession() : null;
  if (fromCash && !session) return { error: "closed" };

  await db.transaction(async (tx) => {
    const [e] = await tx
      .insert(expenses)
      .values({ category, amount, note, date, cashSessionId: session?.id ?? null, userId: user.id })
      .returning({ id: expenses.id });
    await audit(user.id, "expense_create", { expenseId: e.id, category, total: amount, fromCash, reason: note || undefined }, tx);
  });
  revalidate();
  return { ok: true };
}

export async function deleteExpense(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  if (user.role !== "OWNER") return { error: "forbidden" };
  const id = Number(formData.get("id"));
  await db.transaction(async (tx) => {
    const [e] = await tx.delete(expenses).where(eq(expenses.id, id)).returning();
    if (e) await audit(user.id, "expense_delete", { expenseId: id, category: e.category, total: e.amount, date: e.date }, tx);
  });
  revalidate();
  return { ok: true };
}
