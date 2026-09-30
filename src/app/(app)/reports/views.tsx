import Link from "next/link";
import {
  byHour,
  bySeller,
  cashSessionsIn,
  categorySales,
  controlEvents,
  lossesByReason,
  previousPeriod,
  PRODUCT_SORTS,
  productSales,
  timeline,
  totals,
  unsoldProducts,
  type Period,
  type ProductSort,
} from "@/lib/reports";
import { getDict } from "@/i18n/server";
import { describeAudit } from "@/lib/audit-describe";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";

const pct = (v: number) => `${(v * 100).toLocaleString("fr-MA", { maximumFractionDigits: 1 })} %`;

function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card p-5 ${className}`}>
      {title && <h2 className="mb-3 font-bold">{title}</h2>}
      {children}
    </div>
  );
}

function Figure({ label, value, change, tone }: { label: string; value: string; change?: number | null; tone?: "good" | "bad" }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={`num mt-1 text-xl font-bold ${tone === "good" ? "text-brand-700" : tone === "bad" ? "text-red-600" : ""}`}>{value}</div>
      {change !== undefined && change !== null && (
        <div className={`num mt-0.5 text-xs font-semibold ${change >= 0 ? "text-brand-600" : "text-red-600"}`}>
          {change >= 0 ? "▲" : "▼"} {pct(Math.abs(change))}
        </div>
      )}
    </div>
  );
}

const change = (now: number, before: number) => (before > 0 ? (now - before) / before : null);

function Bars({ items }: { items: { key: string; label: string; value: number; title: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="overflow-x-auto">
      <div className="flex h-44 items-end gap-1" style={{ minWidth: items.length * 18 }}>
        {items.map((i) => (
          <div key={i.key} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={i.title}>
            <div className="w-full rounded-t-sm bg-brand-500" style={{ height: `${(i.value / max) * 140}px`, minHeight: 2 }} />
            <span className="num text-[10px] text-muted">{i.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


export async function SummaryView({ period }: { period: Period }) {
  const { t, locale } = await getDict();
  const m = (c: number) => formatMoney(c, locale);
  const [now, before, line, hours, sellers] = await Promise.all([
    totals(period),
    totals(previousPeriod(period)),
    timeline(period),
    byHour(period),
    bySeller(period),
  ]);
  const r = t.reports;
  const hourSpan = hours.length ? Array.from({ length: hours.at(-1)!.hour - hours[0].hour + 1 }, (_, i) => hours[0].hour + i) : [];
  const hourMap = new Map(hours.map((h) => [h.hour, h]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label={r.revenue} value={m(now.revenue)} change={change(now.revenue, before.revenue)} />
        <Figure label={r.grossProfit} value={m(now.grossProfit)} change={change(now.grossProfit, before.grossProfit)} tone="good" />
        <Figure label={r.margin} value={pct(now.margin)} />
        <Figure label={r.netProfit} value={m(now.netProfit)} tone={now.netProfit >= 0 ? "good" : "bad"} />
        <Figure label={r.salesCount} value={String(now.count)} change={change(now.count, before.count)} />
        <Figure label={r.avgBasket} value={m(now.avgBasket)} change={change(now.avgBasket, before.avgBasket)} />
        <Figure label={r.expenses} value={m(now.expenses)} />
        <Figure label={r.losses} value={m(now.losses)} />
      </div>
      <p className="-mt-3 text-xs text-muted">▲▼ {r.vsPrevious}</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label={r.creditGiven} value={m(now.creditGiven)} />
        <Figure label={r.creditRepaid} value={m(now.creditRepaid)} />
        <Figure label={`${r.voided} (${now.voidCount})`} value={m(now.voidTotal)} tone={now.voidCount ? "bad" : undefined} />
      </div>

      <Card title={line.monthly ? r.perMonth : r.perDay}>
        <Bars
          items={line.rows.map((d) => ({
            key: d.bucket,
            label: line.monthly ? `${d.bucket.slice(5, 7)}/${d.bucket.slice(2, 4)}` : `${d.bucket.slice(8)}/${d.bucket.slice(5, 7)}`,
            value: d.revenue,
            title: `${d.bucket} · ${m(d.revenue)} · ${r.grossProfit} ${m(d.profit)} · ${d.count}`,
          }))}
        />
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-brand-700">{r.events}</summary>
          <table className="table mt-2">
            <thead>
              <tr>
                <th>{line.monthly ? r.month : r.day}</th>
                <th>{r.salesCount}</th>
                <th>{r.revenue}</th>
                <th>{r.grossProfit}</th>
              </tr>
            </thead>
            <tbody>
              {line.rows.map((d) => (
                <tr key={d.bucket}>
                  <td className="num">{line.monthly ? d.bucket.slice(0, 7) : d.bucket}</td>
                  <td className="num">{d.count}</td>
                  <td className="num">{m(d.revenue)}</td>
                  <td className="num">{m(d.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={r.perHour}>
          {hours.length === 0 ? (
            <p className="text-sm text-muted">{r.noData}</p>
          ) : (
            <Bars
              items={hourSpan.map((h) => {
                const v = hourMap.get(h);
                return { key: String(h), label: `${h}h`, value: v?.revenue ?? 0, title: `${h}h · ${m(v?.revenue ?? 0)} · ${v?.count ?? 0}` };
              })}
            />
          )}
        </Card>
        <Card title={r.perSeller}>
          {sellers.length === 0 ? (
            <p className="text-sm text-muted">{r.noData}</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{r.seller}</th>
                  <th>{r.salesCount}</th>
                  <th>{r.revenue}</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td className="num">{s.count}</td>
                    <td className="num">{m(s.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

export async function ProductsView({ period, sort, sortHref }: { period: Period; sort: ProductSort; sortHref: (s: string) => string }) {
  const { t, locale } = await getDict();
  const m = (c: number) => formatMoney(c, locale);
  const r = t.reports;
  const [rows, unsold] = await Promise.all([productSales(period, sort), unsoldProducts(period)]);
  const name = (p: { nameFr: string; nameAr: string }) => (locale === "ar" && p.nameAr ? p.nameAr : p.nameFr);
  const unsoldValue = unsold.reduce((s, p) => s + p.value, 0);

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{r.sortBy}:</span>
          {PRODUCT_SORTS.map((s) => (
            <Link key={s} href={sortHref(s)} className={`badge px-3 py-1 ${s === sort ? "bg-brand-600 text-white" : "bg-surface hover:bg-brand-50"}`}>
              {r.sorts[s]}
            </Link>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">{r.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{r.product}</th>
                  <th>{r.qty}</th>
                  <th>{r.revenue}</th>
                  <th>{r.grossProfit}</th>
                  <th>{r.margin}</th>
                  <th>{r.stock}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr key={p.id}>
                    <td className="num text-muted">{i + 1}</td>
                    <td>
                      <Link href={`/products/${p.id}`} className="hover:underline">{name(p)}</Link>
                    </td>
                    <td className="num">{formatQty(p.qty, p.unit)}</td>
                    <td className="num">{m(p.revenue)}</td>
                    <td className={`num ${p.profit < 0 ? "text-red-600" : ""}`}>{m(p.profit)}</td>
                    <td className={`num ${p.margin < 0.1 ? "text-amber-700" : ""}`}>{pct(p.margin)}</td>
                    <td className="num text-muted">{formatQty(p.stock, p.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={r.unsold}>
        <p className="mb-3 text-sm text-muted">
          {r.unsoldHelp} {r.stockValue}: <span className="num font-semibold text-ink">{m(unsoldValue)}</span>
        </p>
        {unsold.length === 0 ? (
          <p className="text-sm text-muted">{t.common.empty}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {unsold.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 py-2">
                <Link href={`/products/${p.id}`} className="hover:underline">{name(p)}</Link>
                <span className="num">
                  <span className="text-muted">{formatQty(p.stock, p.unit)} · </span>
                  {m(p.value)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export async function CategoriesView({ period }: { period: Period }) {
  const { t, locale } = await getDict();
  const m = (c: number) => formatMoney(c, locale);
  const r = t.reports;
  const rows = await categorySales(period);
  const total = rows.reduce((s, c) => s + c.revenue, 0);
  if (rows.length === 0) return <Card><p className="text-sm text-muted">{r.noData}</p></Card>;
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{r.category}</th>
              <th>{r.revenue}</th>
              <th>{r.share}</th>
              <th>{r.grossProfit}</th>
              <th>{r.margin}</th>
              <th>{r.products}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const share = total ? c.revenue / total : 0;
              const profit = c.revenue - c.cost;
              return (
                <tr key={c.id ?? 0}>
                  <td>{c.id ? (locale === "ar" && c.nameAr ? c.nameAr : c.nameFr) : r.noCategory}</td>
                  <td className="num">{m(c.revenue)}</td>
                  <td className="min-w-32">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-surface">
                        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${share * 100}%` }} />
                      </div>
                      <span className="num text-xs text-muted">{pct(share)}</span>
                    </div>
                  </td>
                  <td className="num">{m(profit)}</td>
                  <td className="num">{pct(c.revenue ? profit / c.revenue : 0)}</td>
                  <td className="num">{c.products}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export async function CashView({ period }: { period: Period }) {
  const { t, locale } = await getDict();
  const m = (c: number) => formatMoney(c, locale);
  const r = t.reports;
  const rows = await cashSessionsIn(period);
  const closed = rows.filter((s) => s.closedAt);
  const diffs = closed.map((s) => s.difference ?? 0);
  const total = diffs.reduce((a, b) => a + b, 0);
  const shortages = diffs.filter((d) => d < 0).reduce((a, b) => a + b, 0);
  const surpluses = diffs.filter((d) => d > 0).reduce((a, b) => a + b, 0);
  const perPerson = [...Map.groupBy(closed, (s) => s.closedBy ?? "—")].map(([name, list]) => ({
    name,
    count: list.length,
    total: list.reduce((a, s) => a + (s.difference ?? 0), 0),
    shortages: list.filter((s) => (s.difference ?? 0) < 0).length,
  }));
  const tone = (d: number) => (d < 0 ? "text-red-600" : d > 0 ? "text-amber-600" : "text-brand-600");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label={r.closings} value={String(closed.length)} />
        <Figure label={r.totalDifference} value={m(total)} tone={total < 0 ? "bad" : undefined} />
        <Figure label={r.shortages} value={m(shortages)} tone={shortages < 0 ? "bad" : undefined} />
        <Figure label={r.surpluses} value={m(surpluses)} />
      </div>

      {perPerson.length > 0 && (
        <Card title={r.differenceByPerson}>
          <table className="table">
            <thead>
              <tr>
                <th>{t.common.user}</th>
                <th>{r.closings}</th>
                <th>{r.shortages}</th>
                <th>{r.totalDifference}</th>
              </tr>
            </thead>
            <tbody>
              {perPerson.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td className="num">{p.count}</td>
                  <td className="num">{p.shortages}</td>
                  <td className={`num font-semibold ${tone(p.total)}`}>{m(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title={r.sessions}>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">{r.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{r.opened}</th>
                  <th>{r.closed}</th>
                  <th>{r.openingCash}</th>
                  <th>{r.expected}</th>
                  <th>{r.counted}</th>
                  <th>{r.difference}</th>
                  <th>{t.common.note}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap">
                      <span className="num">{formatDateTime(s.openedAt, locale)}</span>
                      <div className="text-xs text-muted">{s.openedBy}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      {s.closedAt ? (
                        <>
                          <span className="num">{formatDateTime(s.closedAt, locale)}</span>
                          <div className="text-xs text-muted">{s.closedBy}</div>
                        </>
                      ) : (
                        <span className="badge bg-amber-100 text-amber-800">{r.stillOpen}</span>
                      )}
                    </td>
                    <td className="num">{m(s.openingCash)}</td>
                    <td className="num">{s.expected !== null ? m(s.expected) : "—"}</td>
                    <td className="num">{s.counted !== null ? m(s.counted) : "—"}</td>
                    <td className={`num font-semibold ${tone(s.difference ?? 0)}`}>{s.difference !== null ? m(s.difference) : "—"}</td>
                    <td className="text-xs text-muted">{s.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export async function ControlsView({ period }: { period: Period }) {
  const { t, locale } = await getDict();
  const m = (c: number) => formatMoney(c, locale);
  const r = t.reports;
  const [events, lossRows] = await Promise.all([controlEvents(period), lossesByReason(period)]);
  const counts = [...Map.groupBy(events, (e) => e.action)].map(([action, list]) => ({ action, count: list.length }));
  const labels = { ...t.expenseCategories, ...t.lossReasons };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{r.controlsHelp}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={r.byType}>
          {counts.length === 0 ? (
            <p className="text-sm text-muted">{r.noData}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {counts.map((c) => (
                <li key={c.action} className="flex justify-between py-2">
                  <span>{t.auditActions[c.action] ?? c.action}</span>
                  <span className="num font-semibold">{c.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={r.lossesByReason}>
          {lossRows.length === 0 ? (
            <p className="text-sm text-muted">{r.noData}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {lossRows.map((l) => (
                <li key={l.reason} className="flex justify-between py-2">
                  <span>
                    {t.lossReasons[l.reason] ?? l.reason} <span className="num text-muted">({l.count})</span>
                  </span>
                  <span className="num font-semibold">{m(l.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title={r.events}>
        {events.length === 0 ? (
          <p className="text-sm text-muted">{r.noData}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{t.auditActions[e.action] ?? e.action}</span> — {e.userName}{" "}
                  <span className="text-muted">{describeAudit(e.details as Record<string, unknown>, locale, labels)}</span>
                </span>
                <span className="num text-muted">{formatDateTime(e.createdAt, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

