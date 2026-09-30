import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { losses, products, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/i18n/server";
import { formatDateTime, formatMoney, formatQty, monthParam, TIME_ZONE } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { LossForm } from "./loss-form";

export default async function LossesPage({ searchParams }: PageProps<"/losses">) {
  await requireUser();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const month = monthParam(sp.month);
  const initial = {
    productId: Number(sp.product) || undefined,
    quantity: typeof sp.quantity === "string" && /^\d+(\.\d+)?$/.test(sp.quantity) ? sp.quantity : undefined,
    reason: typeof sp.reason === "string" ? sp.reason : undefined,
  };

  const [productRows, rows] = await Promise.all([
    db
      .select({
        id: products.id,
        nameFr: products.nameFr,
        nameAr: products.nameAr,
        barcode: products.barcode,
        unit: products.unit,
        costPrice: products.costPrice,
        stock: products.stock,
      })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.nameFr)),
    db
      .select({ l: losses, p: products, userName: users.name })
      .from(losses)
      .innerJoin(products, eq(products.id, losses.productId))
      .innerJoin(users, eq(users.id, losses.userId))
      .where(sql`to_char(${losses.createdAt} at time zone ${TIME_ZONE}, 'YYYY-MM') = ${month}`)
      .orderBy(desc(losses.createdAt)),
  ]);
  const value = (l: typeof losses.$inferSelect) => Math.round(l.unitCost * l.quantity);
  const total = rows.reduce((s, r) => s + value(r.l), 0);
  const byReason = [...Map.groupBy(rows, (r) => r.l.reason)]
    .map(([reason, list]) => ({ reason, total: list.reduce((s, r) => s + value(r.l), 0) }))
    .sort((a, b) => b.total - a.total);
  const m = (c: number) => formatMoney(c, locale);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t.losses.title} />

      <div className="card p-5">
        <h2 className="mb-1 font-bold">{t.losses.new}</h2>
        <p className="mb-4 text-sm text-muted">{t.losses.help}</p>
        <LossForm products={productRows} initial={initial} />
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-3">
        <div>
          <label className="label">{t.expenses.month}</label>
          <input type="month" name="month" defaultValue={month} className="input" />
        </div>
        <button className="btn-secondary">{t.sales.filter}</button>
        <div className="ms-auto text-end">
          <div className="text-sm text-muted">{t.losses.monthTotal}</div>
          <div className="num text-2xl font-bold text-red-600">{m(total)}</div>
        </div>
      </form>

      {byReason.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 font-bold">{t.losses.byReason}</h2>
          <ul className="divide-y divide-line text-sm">
            {byReason.map((r) => (
              <li key={r.reason} className="flex justify-between py-2">
                <span>{t.lossReasons[r.reason]}</span>
                <span className="num font-semibold">{m(r.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t.common.empty}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t.common.date}</th>
                <th>{t.losses.product}</th>
                <th>{t.common.quantity}</th>
                <th>{t.losses.reason}</th>
                <th>{t.losses.value}</th>
                <th>{t.common.user}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ l, p, userName }) => (
                <tr key={l.id}>
                  <td className="num whitespace-nowrap">{formatDateTime(l.createdAt, locale)}</td>
                  <td>
                    <Link href={`/products/${p.id}`} className="text-brand-700 hover:underline">
                      {locale === "ar" && p.nameAr ? p.nameAr : p.nameFr}
                    </Link>
                  </td>
                  <td className="num">{formatQty(l.quantity, p.unit)}</td>
                  <td>
                    {t.lossReasons[l.reason]}
                    {l.note && <span className="block text-xs text-muted">{l.note}</span>}
                  </td>
                  <td className="num font-semibold text-red-600">{m(value(l))}</td>
                  <td>{userName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
