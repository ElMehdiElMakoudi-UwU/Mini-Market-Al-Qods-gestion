import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, stockCountLines, stockCounts, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { approveCount, cancelCount, reopenCount, submitCount } from "@/actions/stock-counts";
import { getDict } from "@/i18n/server";
import { formatDateTime, formatMoney, formatQty, roundQty } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "../status-badge";
import { ConfirmButton, CountSheet } from "./count-sheet";

export default async function StockCountPage({ params }: PageProps<"/stock-counts/[id]">) {
  const user = await requireUser();
  const isOwner = user.role === "OWNER";
  const { t, locale } = await getDict();
  const id = Number((await params).id);
  const [row] = await db
    .select({ c: stockCounts, startedBy: users.name, category: categories })
    .from(stockCounts)
    .innerJoin(users, eq(users.id, stockCounts.startedById))
    .leftJoin(categories, eq(categories.id, stockCounts.categoryId))
    .where(eq(stockCounts.id, id));
  if (!row) notFound();
  const { c } = row;
  const s = t.stockCounts;

  const scopeProducts = await db
    .select({ id: products.id, nameFr: products.nameFr, nameAr: products.nameAr, barcode: products.barcode, unit: products.unit })
    .from(products)
    .where(and(eq(products.active, true), c.categoryId ? eq(products.categoryId, c.categoryId) : undefined))
    .orderBy(asc(products.nameFr));
  const lines = await db
    .select({ l: stockCountLines, p: { id: products.id, nameFr: products.nameFr, nameAr: products.nameAr, unit: products.unit } })
    .from(stockCountLines)
    .innerJoin(products, eq(products.id, stockCountLines.productId))
    .where(eq(stockCountLines.countId, id));

  const name = (p: { nameFr: string; nameAr: string }) => (locale === "ar" && p.nameAr ? p.nameAr : p.nameFr);
  const scope = row.category ? name(row.category) : s.allProducts;
  const m = (v: number) => formatMoney(v, locale);
  const open = c.status === "IN_PROGRESS" || c.status === "SUBMITTED";

  // For the owner: differences valued at the purchase price recorded when counted.
  const diffs = lines
    .map(({ l, p }) => {
      const diff = l.applied ?? roundQty(l.counted - l.expected);
      return { l, p, diff, value: Math.round(diff * l.unitCost) };
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const withDiff = diffs.filter((d) => d.diff !== 0);
  const shortage = withDiff.filter((d) => d.value < 0).reduce((a, d) => a + d.value, 0);
  const surplus = withDiff.filter((d) => d.value > 0).reduce((a, d) => a + d.value, 0);
  const countedIds = new Set(lines.map(({ l }) => l.productId));
  const uncounted = scopeProducts.filter((p) => !countedIds.has(p.id));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={`${s.title} #${c.id} — ${scope}`}>
        <StatusBadge status={c.status} />
      </PageHeader>
      <p className="text-sm text-muted">
        {s.startedBy} {row.startedBy} · <span className="num">{formatDateTime(c.startedAt, locale)}</span>
        {c.note && <> · « {c.note} »</>}
        {c.status === "APPROVED" && c.closedAt && (
          <> · {s.applied} <span className="num">{formatDateTime(c.closedAt, locale)}</span></>
        )}
      </p>

      {c.status === "IN_PROGRESS" && (
        <>
          <CountSheet
            countId={c.id}
            products={scopeProducts}
            initial={Object.fromEntries(lines.map(({ l }) => [l.productId, { counted: l.counted, expected: isOwner ? l.expected : undefined }]))}
            showExpected={isOwner}
          />
          {!isOwner && (
            <form action={submitCount}>
              <input type="hidden" name="id" value={c.id} />
              <ConfirmButton className="btn-primary w-full sm:w-auto" message={s.submitConfirm}>{s.submit}</ConfirmButton>
            </form>
          )}
        </>
      )}

      {c.status === "SUBMITTED" && !isOwner && <div className="card bg-brand-50 p-5 text-sm">{s.submitted}</div>}

      {!isOwner && c.status !== "IN_PROGRESS" && (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{t.reports.product}</th>
                <th>{s.countedQty}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ l, p }) => (
                <tr key={l.id}>
                  <td>{name(p)}</td>
                  <td className="num">{formatQty(l.counted, p.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isOwner && (lines.length > 0 || c.status !== "IN_PROGRESS") && (
        <div className="card p-5">
          <h2 className="mb-1 font-bold">{s.review}</h2>
          <p className="mb-4 text-sm text-muted">{s.reviewHelp}</p>
          <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-red-50 p-3">
              <div className="text-xs text-muted">{s.shortage}</div>
              <div className="num font-bold text-red-600">{m(shortage)}</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <div className="text-xs text-muted">{s.surplus}</div>
              <div className="num font-bold text-amber-700">{m(surplus)}</div>
            </div>
            <div className={`rounded-lg p-3 ${shortage + surplus < 0 ? "bg-red-50" : "bg-brand-50"}`}>
              <div className="text-xs text-muted">{s.net}</div>
              <div className={`num font-bold ${shortage + surplus < 0 ? "text-red-600" : "text-brand-700"}`}>{m(shortage + surplus)}</div>
            </div>
          </div>
          {withDiff.length === 0 ? (
            <p className="text-sm text-muted">{s.noDifferences}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.reports.product}</th>
                    <th>{s.expected}</th>
                    <th>{s.countedQty}</th>
                    <th>{s.difference}</th>
                    <th>{s.value}</th>
                  </tr>
                </thead>
                <tbody>
                  {withDiff.map(({ l, p, diff, value }) => (
                    <tr key={l.id}>
                      <td>
                        <Link href={`/products/${p.id}`} className="hover:underline">{name(p)}</Link>
                      </td>
                      <td className="num">{formatQty(l.expected, p.unit)}</td>
                      <td className="num">{formatQty(l.counted, p.unit)}</td>
                      <td className={`num font-semibold ${diff < 0 ? "text-red-600" : "text-amber-700"}`}>
                        {diff > 0 ? "+" : ""}
                        {formatQty(diff, p.unit)}
                      </td>
                      <td className={`num ${value < 0 ? "text-red-600" : "text-amber-700"}`}>{m(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-sm text-muted">
            <span className="num">{diffs.length - withDiff.length}</span> {s.matching}
          </p>
          {open && uncounted.length > 0 && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-muted">
                {s.uncounted}: <span className="num">{uncounted.length}</span>
              </summary>
              <p className="mt-1 text-muted">{uncounted.map(name).join(", ")}</p>
            </details>
          )}
          {open && (
            <div className="mt-5 flex flex-wrap gap-2">
              <form action={approveCount}>
                <input type="hidden" name="id" value={c.id} />
                <ConfirmButton className="btn-primary" message={s.approveConfirm}>{s.approve}</ConfirmButton>
              </form>
              {c.status === "SUBMITTED" && (
                <form action={reopenCount}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="btn-secondary">{s.reopen}</button>
                </form>
              )}
              <form action={cancelCount}>
                <input type="hidden" name="id" value={c.id} />
                <ConfirmButton className="btn-secondary text-red-700" message={s.cancelConfirm}>{s.cancel}</ConfirmButton>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
