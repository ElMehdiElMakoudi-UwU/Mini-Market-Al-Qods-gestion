import Link from "next/link";
import { and, asc, eq, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/i18n/server";
import { formatMoney, formatQty } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const low = sp.low === "1";
  const inactive = sp.inactive === "1";

  const where: SQL[] = [];
  if (!inactive) where.push(eq(products.active, true));
  if (low) where.push(lte(products.stock, products.minStock));
  if (q) where.push(or(ilike(products.nameFr, `%${q}%`), ilike(products.nameAr, `%${q}%`), eq(products.barcode, q))!);

  const rows = await db
    .select({ p: products, catFr: categories.nameFr, catAr: categories.nameAr })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(...where))
    .orderBy(asc(products.nameFr));

  const [{ value }] = await db
    .select({ value: sql<number>`coalesce(sum(greatest(${products.stock}, 0) * ${products.costPrice}), 0)::float8` })
    .from(products)
    .where(eq(products.active, true));

  const isOwner = user.role === "OWNER";

  return (
    <div className="space-y-6">
      <PageHeader title={t.products.title}>
        <Link href="/products/categories" className="btn-secondary">{t.products.categories}</Link>
        <Link href="/products/new" className="btn-primary">+ {t.products.new}</Link>
      </PageHeader>

      <form className="card flex flex-wrap items-center gap-3 p-3">
        <input name="q" defaultValue={q} placeholder={t.common.search} className="input max-w-xs" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="low" value="1" defaultChecked={low} /> {t.products.filterLow}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="inactive" value="1" defaultChecked={inactive} /> {t.products.showInactive}
        </label>
        <button className="btn-secondary">{t.sales.filter}</button>
        {isOwner && (
          <span className="ms-auto text-sm text-muted">
            {t.products.stockValue}: <span className="num font-semibold text-ink">{formatMoney(Math.round(value), locale)}</span>
          </span>
        )}
      </form>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t.common.empty}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t.common.name}</th>
                <th>{t.products.barcode}</th>
                <th>{t.products.category}</th>
                <th>{t.products.salePrice}</th>
                {isOwner && <th>{t.products.costPrice}</th>}
                {isOwner && <th>{t.products.margin}</th>}
                <th>{t.products.stock}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, catFr, catAr }) => {
                const isLow = p.stock <= p.minStock;
                const margin = p.salePrice > 0 && p.costPrice > 0 ? Math.round(((p.salePrice - p.costPrice) / p.salePrice) * 100) : null;
                return (
                  <tr key={p.id} className={`hover:bg-surface ${p.active ? "" : "opacity-50"}`}>
                    <td>
                      <Link href={`/products/${p.id}`} className="font-semibold text-brand-700 hover:underline">
                        {locale === "ar" && p.nameAr ? p.nameAr : p.nameFr}
                      </Link>
                      {p.quickKey && <span className="ms-1 text-amber-500">★</span>}
                    </td>
                    <td className="num text-muted">{p.barcode}</td>
                    <td>{(locale === "ar" && catAr) || catFr}</td>
                    <td className="num whitespace-nowrap">
                      {formatMoney(p.salePrice, locale)}
                      {p.unit === "KG" && "/kg"}
                    </td>
                    {isOwner && <td className="num whitespace-nowrap text-muted">{formatMoney(p.costPrice, locale)}</td>}
                    {isOwner && <td className="num">{margin === null ? "—" : `${margin}%`}</td>}
                    <td>
                      <span className={`num font-semibold ${isLow ? "text-red-600" : ""}`}>{formatQty(p.stock, p.unit)}</span>
                      {isLow && <span className="badge ms-2 bg-red-50 text-red-700">{t.products.lowStock}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
