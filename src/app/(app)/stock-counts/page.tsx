import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, stockCountLines, stockCounts, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/i18n/server";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StartCountForm } from "./start-form";
import { StatusBadge } from "./status-badge";

export default async function StockCountsPage() {
  await requireUser();
  const { t, locale } = await getDict();
  const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.nameFr));
  const rows = await db
    .select({
      c: stockCounts,
      startedBy: users.name,
      categoryFr: categories.nameFr,
      categoryAr: categories.nameAr,
      lines: sql<number>`(select count(*)::int from ${stockCountLines} where ${stockCountLines.countId} = ${stockCounts.id})`,
    })
    .from(stockCounts)
    .innerJoin(users, eq(users.id, stockCounts.startedById))
    .leftJoin(categories, eq(categories.id, stockCounts.categoryId))
    .orderBy(desc(stockCounts.startedAt))
    .limit(100);
  const open = rows.find((r) => r.c.status === "IN_PROGRESS" || r.c.status === "SUBMITTED");
  const scope = (r: (typeof rows)[number]) =>
    r.c.categoryId ? (locale === "ar" && r.categoryAr ? r.categoryAr : r.categoryFr) : t.stockCounts.allProducts;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.stockCounts.title} />
      <p className="text-sm text-muted">{t.stockCounts.help}</p>

      {open ? (
        <Link href={`/stock-counts/${open.c.id}`} className="card flex flex-wrap items-center gap-3 border-brand-300 bg-brand-50 p-5 hover:shadow-sm">
          <div>
            <div className="font-bold">
              {t.stockCounts.current} <span className="num">#{open.c.id}</span> — {scope(open)}
            </div>
            <div className="text-sm text-muted">
              <span className="num">{open.lines}</span> {t.stockCounts.counted.toLowerCase()} · <StatusBadge status={open.c.status} />
            </div>
          </div>
          <span className="btn-primary ms-auto">{t.stockCounts.continue} →</span>
        </Link>
      ) : (
        <div className="card p-5">
          <h2 className="mb-3 font-bold">{t.stockCounts.start}</h2>
          <StartCountForm categories={cats.map((c) => ({ id: c.id, name: locale === "ar" && c.nameAr ? c.nameAr : c.nameFr }))} />
        </div>
      )}

      <div className="card overflow-x-auto">
        <h2 className="p-5 pb-2 font-bold">{t.stockCounts.history}</h2>
        {rows.length === 0 ? (
          <p className="p-5 pt-0 text-sm text-muted">{t.common.empty}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t.common.date}</th>
                <th>{t.stockCounts.scope}</th>
                <th>{t.stockCounts.startedBy}</th>
                <th>{t.stockCounts.progress}</th>
                <th>{t.common.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.c.id}>
                  <td>
                    <Link href={`/stock-counts/${r.c.id}`} className="num font-semibold text-brand-700 hover:underline">#{r.c.id}</Link>
                  </td>
                  <td className="num whitespace-nowrap">{formatDateTime(r.c.startedAt, locale)}</td>
                  <td>{scope(r)}</td>
                  <td>{r.startedBy}</td>
                  <td className="num">{r.lines}</td>
                  <td><StatusBadge status={r.c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
