import Link from "next/link";
import { and, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, products, saleItems, sales, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/i18n/server";
import { formatDateTime, formatMoney, formatQty, TIME_ZONE, todayInMorocco } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { VoidSaleButton } from "./void-sale-button";

export default async function SalesPage({ searchParams }: PageProps<"/sales">) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const valid = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const from = valid(sp.from) ? (sp.from as string) : todayInMorocco();
  const to = valid(sp.to) ? (sp.to as string) : from;
  const isOwner = user.role === "OWNER";

  const localDate = sql`(${sales.createdAt} at time zone ${TIME_ZONE})::date`;
  const rows = await db
    .select({ s: sales, userName: users.name, customerName: customers.name })
    .from(sales)
    .innerJoin(users, eq(users.id, sales.userId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(and(sql`${localDate} >= ${from}::date`, sql`${localDate} <= ${to}::date`))
    .orderBy(desc(sales.createdAt))
    .limit(500);

  const items = rows.length
    ? await db
        .select({ ...getTableColumns(saleItems), unit: products.unit })
        .from(saleItems)
        .innerJoin(products, eq(products.id, saleItems.productId))
        .where(inArray(saleItems.saleId, rows.map((r) => r.s.id)))
    : [];
  const itemsBySale = Map.groupBy(items, (i) => i.saleId);

  const completed = rows.filter((r) => r.s.status === "COMPLETED");
  const revenue = completed.reduce((s, r) => s + r.s.total, 0);
  const profit = completed.reduce(
    (s, r) => s + (itemsBySale.get(r.s.id) ?? []).reduce((a, i) => a + i.lineTotal - Math.round(i.unitCost * i.quantity), 0),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t.sales.title} />
      <form className="card flex flex-wrap items-end gap-3 p-3">
        <div>
          <label className="label">{t.sales.from}</label>
          <input type="date" name="from" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="label">{t.sales.to}</label>
          <input type="date" name="to" defaultValue={to} className="input" />
        </div>
        <button className="btn-secondary">{t.sales.filter}</button>
        <div className="ms-auto flex gap-6 text-sm">
          <div>
            <div className="text-muted">{t.sales.count}</div>
            <div className="num text-lg font-bold">{completed.length}</div>
          </div>
          <div>
            <div className="text-muted">{t.common.total}</div>
            <div className="num text-lg font-bold">{formatMoney(revenue, locale)}</div>
          </div>
          {isOwner && (
            <div>
              <div className="text-muted">{t.sales.profit}</div>
              <div className="num text-lg font-bold text-brand-700">{formatMoney(profit, locale)}</div>
            </div>
          )}
        </div>
      </form>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t.common.empty}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t.sales.number}</th>
                <th>{t.common.date}</th>
                <th>{t.sales.items}</th>
                <th>{t.common.total}</th>
                <th>{t.common.user}</th>
                <th>{t.common.status}</th>
                {isOwner && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, userName, customerName }) => {
                const lines = itemsBySale.get(s.id) ?? [];
                return (
                  <tr key={s.id} className={s.status === "VOIDED" ? "bg-red-50/50" : ""}>
                    <td className="num font-semibold">{s.number}</td>
                    <td className="num whitespace-nowrap">{formatDateTime(s.createdAt, locale)}</td>
                    <td>
                      <details>
                        <summary className="cursor-pointer text-sm text-brand-700">
                          <span className="num">{lines.length}</span> {t.pos.items}
                        </summary>
                        <ul className="mt-1 space-y-0.5 text-xs text-muted">
                          {lines.map((i) => (
                            <li key={i.id} className="num">
                              {i.name} — {formatQty(i.quantity, i.unit)} × {formatMoney(i.unitPrice, locale)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                    <td>
                      <span className={`num font-semibold ${s.status === "VOIDED" ? "line-through" : ""}`}>{formatMoney(s.total, locale)}</span>
                      {s.creditAmount > 0 && (
                        <div className="text-xs">
                          <span className="badge bg-amber-100 text-amber-800">{t.sales.credit}</span>{" "}
                          <Link href={`/customers/${s.customerId}`} className="text-brand-700 hover:underline">{customerName}</Link>{" "}
                          <span className="num text-muted">{formatMoney(s.creditAmount, locale)}</span>
                        </div>
                      )}
                    </td>
                    <td>{userName}</td>
                    <td>
                      {s.status === "VOIDED" ? (
                        <span className="badge bg-red-100 text-red-700" title={s.voidReason ?? ""}>{t.sales.voided}</span>
                      ) : (
                        <span className="badge bg-brand-50 text-brand-700">{t.sales.completed}</span>
                      )}
                      {s.voidReason && <div className="text-xs text-muted">{s.voidReason}</div>}
                    </td>
                    {isOwner && <td>{s.status === "COMPLETED" && <VoidSaleButton saleId={s.id} number={s.number} />}</td>}
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
