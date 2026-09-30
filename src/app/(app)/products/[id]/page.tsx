import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, stockMovements, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/i18n/server";
import { formatDateTime, formatQty } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "../product-form";
import { AdjustStockForm } from "./adjust-stock-form";

export default async function EditProductPage({ params }: PageProps<"/products/[id]">) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const id = Number((await params).id);
  const [product] = Number.isInteger(id) ? await db.select().from(products).where(eq(products.id, id)) : [];
  if (!product) notFound();
  const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.nameFr));
  const history = await db
    .select({ mv: stockMovements, userName: users.name })
    .from(stockMovements)
    .leftJoin(users, eq(users.id, stockMovements.userId))
    .where(eq(stockMovements.productId, id))
    .orderBy(desc(stockMovements.createdAt))
    .limit(50);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={t.products.editTitle} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ProductForm product={product} categories={cats} isOwner={user.role === "OWNER"} />
        <div className="card h-fit p-5">
          <div className="text-sm text-muted">{t.products.stock}</div>
          <div className={`num text-3xl font-bold ${product.stock <= product.minStock ? "text-red-600" : ""}`}>
            {formatQty(product.stock, product.unit)}
          </div>
          {user.role === "OWNER" && (
            <div className="mt-4 border-t border-line pt-4">
              <h2 className="mb-1 font-semibold">{t.products.adjustStock}</h2>
              <p className="mb-3 text-xs text-muted">{t.products.adjustHelp}</p>
              <AdjustStockForm productId={product.id} />
            </div>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="p-5 pb-2 font-bold">{t.products.history}</h2>
        {history.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">{t.common.empty}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t.common.date}</th>
                <th>{t.common.status}</th>
                <th>{t.common.quantity}</th>
                <th>{t.products.stock}</th>
                <th>{t.common.user}</th>
                <th>{t.common.note}</th>
              </tr>
            </thead>
            <tbody>
              {history.map(({ mv, userName }) => (
                <tr key={mv.id}>
                  <td className="num whitespace-nowrap">{formatDateTime(mv.createdAt, locale)}</td>
                  <td>{t.movementTypes[mv.type]} {mv.reference && <span className="num text-muted">{mv.reference}</span>}</td>
                  <td className={`num font-semibold ${mv.quantity < 0 ? "text-red-600" : "text-brand-600"}`}>
                    {mv.quantity > 0 ? "+" : ""}
                    {formatQty(mv.quantity, product.unit)}
                  </td>
                  <td className="num">{formatQty(mv.stockAfter, product.unit)}</td>
                  <td>{userName}</td>
                  <td className="text-muted">{mv.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
