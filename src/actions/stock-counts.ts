"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories, stockCountLines, stockCounts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { approveStockCount, OPEN_COUNT as OPEN, recordCountLine } from "@/lib/stock-count";

type State = { error?: string; ok?: boolean } | undefined;

async function getCount(id: number) {
  const [c] = await db.select().from(stockCounts).where(eq(stockCounts.id, id));
  return c;
}

function revalidate(id?: number) {
  revalidatePath("/stock-counts");
  if (id) revalidatePath(`/stock-counts/${id}`);
}

export async function startCount(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const categoryId = Number(formData.get("categoryId")) || null;
  const note = String(formData.get("note") ?? "").trim();
  const [open] = await db.select({ id: stockCounts.id }).from(stockCounts).where(inArray(stockCounts.status, [...OPEN]));
  if (open) return { error: "countOpen" };
  let name: string | undefined;
  if (categoryId) {
    const [cat] = await db.select().from(categories).where(eq(categories.id, categoryId));
    if (!cat) return { error: "generic" };
    name = cat.nameFr;
  }
  const [c] = await db.insert(stockCounts).values({ categoryId, note, startedById: user.id }).returning();
  await audit(user.id, "stock_count_start", { countId: c.id, number: c.id, name });
  revalidate();
  redirect(`/stock-counts/${c.id}`);
}

/** Records what is on the shelf for one product (replaces an earlier count of it). */
export async function saveCountLine(countId: number, productId: number, counted: number) {
  const user = await requireUser();
  const res = await recordCountLine(countId, productId, counted, user.id);
  if (!("ok" in res)) return res;
  revalidatePath(`/stock-counts/${countId}`);
  // Managers count blind: they never get the expected stock back.
  return { ...res, expected: user.role === "OWNER" ? res.expected : undefined };
}

export async function removeCountLine(countId: number, productId: number) {
  await requireUser();
  const count = await getCount(countId);
  if (!count || count.status !== "IN_PROGRESS") return { error: "countClosed" } as const;
  await db.delete(stockCountLines).where(and(eq(stockCountLines.countId, countId), eq(stockCountLines.productId, productId)));
  revalidatePath(`/stock-counts/${countId}`);
  return { ok: true } as const;
}

export async function submitCount(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const [c] = await db
    .update(stockCounts)
    .set({ status: "SUBMITTED", submittedById: user.id, submittedAt: new Date() })
    .where(and(eq(stockCounts.id, id), eq(stockCounts.status, "IN_PROGRESS")))
    .returning();
  if (c) {
    const lines = await db.$count(stockCountLines, eq(stockCountLines.countId, id));
    await audit(user.id, "stock_count_submit", { countId: id, number: id, lines });
  }
  revalidate(id);
}

export async function reopenCount(formData: FormData) {
  const user = await requireUser("OWNER");
  const id = Number(formData.get("id"));
  const [c] = await db
    .update(stockCounts)
    .set({ status: "IN_PROGRESS", submittedById: null, submittedAt: null })
    .where(and(eq(stockCounts.id, id), eq(stockCounts.status, "SUBMITTED")))
    .returning();
  if (c) await audit(user.id, "stock_count_reopen", { countId: id, number: id });
  revalidate(id);
}

export async function cancelCount(formData: FormData) {
  const user = await requireUser("OWNER");
  const id = Number(formData.get("id"));
  const [c] = await db
    .update(stockCounts)
    .set({ status: "CANCELLED", closedById: user.id, closedAt: new Date() })
    .where(and(eq(stockCounts.id, id), inArray(stockCounts.status, [...OPEN])))
    .returning();
  if (c) await audit(user.id, "stock_count_cancel", { countId: id, number: id });
  revalidate(id);
}

export async function approveCount(formData: FormData) {
  const user = await requireUser("OWNER");
  const id = Number(formData.get("id"));
  await approveStockCount(id, user.id);
  revalidate(id);
  revalidatePath("/products");
}
