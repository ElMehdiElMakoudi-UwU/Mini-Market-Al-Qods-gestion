"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cashMovements, cashSessions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { cashSummary, getOpenCashSession } from "@/lib/cash";
import { toCents } from "@/lib/format";

type State = { error?: string; ok?: boolean } | undefined;

export async function openCash(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const openingCash = toCents(String(formData.get("openingCash") ?? ""));
  if (!Number.isFinite(openingCash) || openingCash < 0) return { error: "amount" };
  if (await getOpenCashSession()) return { error: "alreadyOpen" };
  const [s] = await db.insert(cashSessions).values({ openedById: user.id, openingCash }).returning();
  await audit(user.id, "cash_open", { sessionId: s.id, openingCash });
  revalidatePath("/cash");
  return { ok: true };
}

export async function addCashMovement(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const session = await getOpenCashSession();
  if (!session) return { error: "closed" };
  const type = formData.get("type") === "IN" ? "IN" : "OUT";
  const amount = toCents(String(formData.get("amount") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!Number.isFinite(amount) || amount <= 0) return { error: "amount" };
  if (!reason) return { error: "reason" };
  await db.insert(cashMovements).values({ cashSessionId: session.id, type, amount, reason, userId: user.id });
  await audit(user.id, "cash_movement", { sessionId: session.id, type, amount, reason });
  revalidatePath("/cash");
  return { ok: true };
}

export async function closeCash(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const session = await getOpenCashSession();
  if (!session) return { error: "closed" };
  const counted = toCents(String(formData.get("countedCash") ?? ""));
  if (!Number.isFinite(counted) || counted < 0) return { error: "amount" };
  const note = String(formData.get("note") ?? "").trim();
  const { expected } = await cashSummary(session.id, session.openingCash);
  const difference = counted - expected;
  await db
    .update(cashSessions)
    .set({ closedAt: new Date(), closedById: user.id, expectedCash: expected, countedCash: counted, difference, note })
    .where(eq(cashSessions.id, session.id));
  await audit(user.id, "cash_close", { sessionId: session.id, expected, counted, difference });
  revalidatePath("/cash");
  return { ok: true };
}
