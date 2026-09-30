import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getOpenCashSession } from "@/lib/cash";

// Everything the POS needs to keep selling offline.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [productRows, categoryRows, session] = await Promise.all([
    db
      .select({
        id: products.id,
        nameFr: products.nameFr,
        nameAr: products.nameAr,
        barcode: products.barcode,
        categoryId: products.categoryId,
        unit: products.unit,
        salePrice: products.salePrice,
        stock: products.stock,
        quickKey: products.quickKey,
      })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.nameFr)),
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.nameFr)),
    getOpenCashSession(),
  ]);

  return NextResponse.json({
    user: { id: user.id, name: user.name, role: user.role },
    products: productRows,
    categories: categoryRows,
    cashSession: session ? { id: session.id, openedAt: session.openedAt, openedByName: session.openedByName } : null,
    fetchedAt: new Date().toISOString(),
  });
}
