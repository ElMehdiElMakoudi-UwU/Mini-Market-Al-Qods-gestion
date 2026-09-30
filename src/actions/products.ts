"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { moveStock } from "@/lib/stock";
import { roundQty, toCents } from "@/lib/format";

type State = { error?: string; ok?: boolean } | undefined;

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function num(formData: FormData, key: string) {
  const n = parseFloat(str(formData, key).replace(",", ".") || "0");
  return Number.isFinite(n) ? roundQty(n) : NaN;
}

export async function saveProduct(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const id = Number(formData.get("id")) || null;
  const isOwner = user.role === "OWNER";

  const nameFr = str(formData, "nameFr");
  const barcode = str(formData, "barcode") || null;
  const salePrice = toCents(str(formData, "salePrice"));
  const costPrice = toCents(str(formData, "costPrice") || "0");
  const minStock = num(formData, "minStock");
  if (!nameFr) return { error: "required" };
  if (!Number.isFinite(salePrice) || salePrice < 0 || !Number.isFinite(costPrice) || costPrice < 0) return { error: "amount" };
  if (!Number.isFinite(minStock)) return { error: "required" };

  if (barcode) {
    const [dup] = await db
      .select({ id: products.id })
      .from(products)
      .where(id ? and(eq(products.barcode, barcode), ne(products.id, id)) : eq(products.barcode, barcode));
    if (dup) return { error: "duplicateBarcode" };
  }

  const fields = {
    nameFr,
    nameAr: str(formData, "nameAr"),
    barcode,
    categoryId: Number(formData.get("categoryId")) || null,
    unit: formData.get("unit") === "KG" ? ("KG" as const) : ("PIECE" as const),
    minStock,
    quickKey: formData.get("quickKey") === "on",
    active: id ? formData.get("active") === "on" : true,
    updatedAt: new Date(),
  };

  if (id) {
    const [before] = await db.select().from(products).where(eq(products.id, id));
    if (!before) return { error: "generic" };
    // Only the owner can change prices of existing products.
    const prices = isOwner ? { salePrice, costPrice } : {};
    await db.update(products).set({ ...fields, ...prices }).where(eq(products.id, id));
    if (isOwner && (before.salePrice !== salePrice || before.costPrice !== costPrice)) {
      await audit(user.id, "price_change", {
        productId: id,
        name: nameFr,
        salePrice: [before.salePrice, salePrice],
        costPrice: [before.costPrice, costPrice],
      });
    }
    await audit(user.id, "product_update", { productId: id, name: nameFr });
  } else {
    const initialStock = num(formData, "initialStock");
    const newId = await db.transaction(async (tx) => {
      const [p] = await tx.insert(products).values({ ...fields, salePrice, costPrice }).returning({ id: products.id });
      if (Number.isFinite(initialStock) && initialStock !== 0) {
        await moveStock(tx, { productId: p.id, delta: initialStock, type: "ADJUSTMENT", userId: user.id, note: "Stock initial" });
      }
      await audit(user.id, "product_create", { productId: p.id, name: nameFr, salePrice, initialStock }, tx);
      return p.id;
    });
    revalidatePath("/products");
    const returnTo = str(formData, "returnTo");
    // Tell the page we came from (e.g. a delivery) which product was just created.
    if (returnTo.startsWith("/")) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}added=${newId}`);
    redirect("/products");
  }

  revalidatePath("/products");
  const returnTo = str(formData, "returnTo");
  redirect(returnTo.startsWith("/") ? returnTo : "/products");
}

export async function adjustStock(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  if (user.role !== "OWNER") return { error: "forbidden" };
  const productId = Number(formData.get("productId"));
  const newStock = num(formData, "newStock");
  const reason = str(formData, "reason");
  if (!Number.isFinite(newStock) || str(formData, "newStock") === "") return { error: "required" };
  if (!reason) return { error: "reason" };
  await db.transaction(async (tx) => {
    const [p] = await tx.select({ stock: products.stock, nameFr: products.nameFr }).from(products).where(eq(products.id, productId));
    if (!p) throw new Error("not found");
    const delta = roundQty(newStock - p.stock);
    if (delta === 0) return;
    await moveStock(tx, { productId, delta, type: "ADJUSTMENT", userId: user.id, note: reason });
    await audit(user.id, "stock_adjust", { productId, name: p.nameFr, from: p.stock, to: newStock, reason }, tx);
  });
  revalidatePath(`/products/${productId}`);
  return { ok: true };
}

export async function createCategory(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser();
  const nameFr = str(formData, "nameFr");
  if (!nameFr) return { error: "required" };
  const [c] = await db
    .insert(categories)
    .values({ nameFr, nameAr: str(formData, "nameAr"), sortOrder: Number(formData.get("sortOrder")) || 0 })
    .returning();
  await audit(user.id, "category_create", { categoryId: c.id, name: nameFr });
  revalidatePath("/products");
  return { ok: true };
}
