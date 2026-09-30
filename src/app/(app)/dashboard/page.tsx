import Link from "next/link";
import { and, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, cashSessions, creditEntries, products, saleItems, sales, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { cashSummary, getOpenCashSession } from "@/lib/cash";
import { customersWithBalance } from "@/lib/credit";
import { suppliersWithBalance } from "@/lib/supplier-debt";
import { getDict } from "@/i18n/server";
import { formatDateTime, formatMoney, formatQty, formatTime, TIME_ZONE } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { AutoRefresh } from "@/components/auto-refresh";
import { describeAudit } from "@/lib/audit-describe";

const ALERT_ACTIONS = ["sale_void", "price_change", "stock_adjust", "cash_close", "cash_movement", "credit_adjust", "supplier_payment", "supplier_adjust"];

export default async function DashboardPage() {
  await requireUser("OWNER");
  const { t, locale } = await getDict();
  const m = (c: number) => formatMoney(c, locale);

  const isToday = sql`(${sales.createdAt} at time zone ${TIME_ZONE})::date = (now() at time zone ${TIME_ZONE})::date`;
  const completed = eq(sales.status, "COMPLETED");

  const [today] = await db
    .select({ revenue: sql<number>`coalesce(sum(${sales.total}), 0)::int`, count: sql<number>`count(*)::int` })
    .from(sales)
    .where(and(isToday, completed));

  const [{ profit }] = await db
    .select({ profit: sql<number>`coalesce(sum(${saleItems.lineTotal} - round(${saleItems.unitCost} * ${saleItems.quantity})), 0)::int` })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(and(isToday, completed));

  const last7 = await db.execute<{ day: string; revenue: number }>(sql`
    select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(sum(s.total), 0)::int as revenue
    from generate_series((now() at time zone ${TIME_ZONE})::date - 6, (now() at time zone ${TIME_ZONE})::date, '1 day') as d(day)
    left join ${sales} s on (s.created_at at time zone ${TIME_ZONE})::date = d.day and s.status = 'COMPLETED'
    group by d.day order by d.day`);

  const top = await db
    .select({
      name: saleItems.name,
      unit: products.unit,
      qty: sql<number>`sum(${saleItems.quantity})::float8`,
      revenue: sql<number>`sum(${saleItems.lineTotal})::int`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(products, eq(products.id, saleItems.productId))
    .where(and(isToday, completed))
    .groupBy(saleItems.name, products.unit)
    .orderBy(desc(sql`sum(${saleItems.lineTotal})`))
    .limit(5);

  const lowStock = await db
    .select()
    .from(products)
    .where(and(eq(products.active, true), lte(products.stock, products.minStock)))
    .orderBy(products.stock)
    .limit(10);

  const recentSales = await db
    .select({ s: sales, userName: users.name })
    .from(sales)
    .innerJoin(users, eq(users.id, sales.userId))
    .orderBy(desc(sales.createdAt))
    .limit(8);

  const closings = await db.select().from(cashSessions).where(isNotNull(cashSessions.closedAt)).orderBy(desc(cashSessions.closedAt)).limit(5);

  const alerts = await db
    .select({ a: auditLogs, userName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(inArray(auditLogs.action, ALERT_ACTIONS))
    .orderBy(desc(auditLogs.createdAt))
    .limit(8);

  const [creditToday] = await db
    .select({
      // Voided credit sales cancel out their original entry.
      given: sql<number>`coalesce(sum(case when ${creditEntries.type} in ('SALE', 'VOID') then ${creditEntries.amount} end), 0)::int`,
      repaid: sql<number>`coalesce(-sum(case when ${creditEntries.type} = 'PAYMENT' then ${creditEntries.amount} end), 0)::int`,
    })
    .from(creditEntries)
    .where(sql`(${creditEntries.createdAt} at time zone ${TIME_ZONE})::date = (now() at time zone ${TIME_ZONE})::date`);
  const debtors = (await customersWithBalance()).filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance);
  const totalOwed = debtors.reduce((s, c) => s + c.balance, 0);
  const creditors = (await suppliersWithBalance()).filter((s) => s.balance > 0).sort((a, b) => b.balance - a.balance);
  const owedToSuppliers = creditors.reduce((s, c) => s + c.balance, 0);

  const session = await getOpenCashSession();
  const cash = session ? await cashSummary(session.id, session.openingCash) : null;
  const lastSync = recentSales[0]?.s.syncedAt;
  const maxDay = Math.max(1, ...last7.map((d) => d.revenue));

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />
      <PageHeader title={t.dashboard.title}>
        {lastSync && (
          <span className="text-sm text-muted">
            {t.dashboard.lastSync}: <span className="num">{formatDateTime(lastSync, locale)}</span>
          </span>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t.dashboard.todaySales} value={m(today.revenue)} />
        <Kpi label={t.dashboard.todayProfit} value={m(profit)} accent />
        <Kpi label={t.dashboard.salesCount} value={String(today.count)} />
        <Kpi label={t.dashboard.avgBasket} value={m(today.count ? Math.round(today.revenue / today.count) : 0)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5">
          <h2 className="mb-3 font-bold">{t.nav.cash}</h2>
          {session && cash ? (
            <>
              <div className="text-sm text-muted">{t.dashboard.cashNow}</div>
              <div className="num text-3xl font-bold text-brand-700">{m(cash.expected)}</div>
              <p className="mt-2 text-sm text-muted">
                {t.dashboard.openSince} <span className="num">{formatDateTime(session.openedAt, locale)}</span> {t.dashboard.by} {session.openedByName}
              </p>
              <dl className="mt-3 space-y-1 text-sm">
                <Row label={t.cash.openingCash} value={m(session.openingCash)} />
                <Row label={`${t.cash.salesCash} (${cash.salesCount})`} value={m(cash.salesTotal)} />
                <Row label={t.cash.creditPayments} value={m(cash.creditPayments)} />
                <Row label={t.cash.cashIn} value={m(cash.cashIn)} />
                <Row label={t.cash.cashOut} value={m(cash.cashOut)} />
                <Row label={t.cash.supplierPayments} value={m(cash.supplierPayments)} />
              </dl>
            </>
          ) : (
            <p className="text-muted">{t.dashboard.cashClosed}</p>
          )}
        </div>

        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-bold">{t.dashboard.last7}</h2>
          <div className="flex h-44 items-end gap-2">
            {last7.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <span className="num text-[11px] text-muted">{d.revenue ? Math.round(d.revenue / 100) : ""}</span>
                <div className="w-full rounded-t-md bg-brand-500" style={{ height: `${(d.revenue / maxDay) * 120}px`, minHeight: 2 }} />
                <span className="num text-[11px] text-muted">{d.day.slice(8)}/{d.day.slice(5, 7)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-bold">{t.dashboard.topProducts}</h2>
          {top.length === 0 ? (
            <p className="text-sm text-muted">{t.common.empty}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {top.map((p) => (
                <li key={p.name} className="flex justify-between py-2">
                  <span>
                    {p.name} <span className="num text-muted">× {formatQty(p.qty, p.unit)}</span>
                  </span>
                  <span className="num font-semibold">{m(p.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 flex justify-between font-bold">
            {t.dashboard.credit}
            <Link href="/customers?debt=1" className="text-sm font-medium text-brand-700 hover:underline">→</Link>
          </h2>
          <div className="text-sm text-muted">{t.dashboard.totalOwed}</div>
          <div className="num text-3xl font-bold text-red-600">{m(totalOwed)}</div>
          <dl className="mt-3 space-y-1 text-sm">
            <Row label={t.dashboard.todayCredit} value={m(creditToday.given)} />
            <Row label={t.dashboard.todayPayments} value={m(creditToday.repaid)} />
          </dl>
          {debtors.length > 0 && (
            <>
              <h3 className="mt-4 mb-1 text-sm font-semibold">{t.dashboard.topDebtors}</h3>
              <ul className="divide-y divide-line text-sm">
                {debtors.slice(0, 5).map((c) => (
                  <li key={c.id} className="flex justify-between py-2">
                    <Link href={`/customers/${c.id}`} className="hover:underline">{c.name}</Link>
                    <span className={`num font-semibold ${c.creditLimit > 0 && c.balance > c.creditLimit ? "text-red-600" : ""}`}>{m(c.balance)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 flex justify-between font-bold">
            {t.dashboard.supplierDebts}
            <Link href="/suppliers" className="text-sm font-medium text-brand-700 hover:underline">→</Link>
          </h2>
          <div className="text-sm text-muted">{t.dashboard.totalOwedSuppliers}</div>
          <div className="num text-3xl font-bold text-red-600">{m(owedToSuppliers)}</div>
          {creditors.length > 0 && (
            <>
              <h3 className="mt-4 mb-1 text-sm font-semibold">{t.dashboard.topCreditors}</h3>
              <ul className="divide-y divide-line text-sm">
                {creditors.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex justify-between py-2">
                    <Link href={`/suppliers/${s.id}`} className="hover:underline">{s.name}</Link>
                    <span className="num font-semibold">{m(s.balance)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 font-bold">{t.dashboard.lowStock}</h2>
          {lowStock.length === 0 ? (
            <p className="text-sm text-muted">{t.dashboard.noLowStock}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {lowStock.map((p) => (
                <li key={p.id} className="flex justify-between py-2">
                  <Link href={`/products/${p.id}`} className="hover:underline">
                    {locale === "ar" && p.nameAr ? p.nameAr : p.nameFr}
                  </Link>
                  <span className="num font-semibold text-red-600">
                    {formatQty(p.stock, p.unit)} <span className="font-normal text-muted">/ {formatQty(p.minStock, p.unit)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 flex justify-between font-bold">
            {t.dashboard.recentSales}
            <Link href="/sales" className="text-sm font-medium text-brand-700 hover:underline">→</Link>
          </h2>
          {recentSales.length === 0 ? (
            <p className="text-sm text-muted">{t.common.empty}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {recentSales.map(({ s, userName }) => (
                <li key={s.id} className="flex justify-between py-2">
                  <span>
                    <span className="num font-semibold">#{s.number}</span> · <span className="num">{formatTime(s.createdAt, locale)}</span> · {userName}
                    {s.status === "VOIDED" && <span className="badge ms-2 bg-red-100 text-red-700">{t.sales.voided}</span>}
                  </span>
                  <span className={`num font-semibold ${s.status === "VOIDED" ? "line-through" : ""}`}>{m(s.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 font-bold">{t.dashboard.closings}</h2>
          {closings.length === 0 ? (
            <p className="text-sm text-muted">{t.common.empty}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {closings.map((c) => (
                <li key={c.id} className="flex justify-between py-2">
                  <span className="num">{formatDateTime(c.closedAt!, locale)}</span>
                  <span className={`num font-semibold ${(c.difference ?? 0) < 0 ? "text-red-600" : (c.difference ?? 0) > 0 ? "text-amber-600" : "text-brand-600"}`}>
                    {t.cash.difference}: {m(c.difference ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 flex justify-between font-bold">
          {t.dashboard.alerts}
          <Link href="/activity" className="text-sm font-medium text-brand-700 hover:underline">→</Link>
        </h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted">{t.common.empty}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {alerts.map(({ a, userName }) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{t.auditActions[a.action] ?? a.action}</span> — {userName}{" "}
                  <span className="text-muted">{describeAudit(a.details as Record<string, unknown>, locale)}</span>
                </span>
                <span className="num text-muted">{formatDateTime(a.createdAt, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={`num mt-1 text-2xl font-bold ${accent ? "text-brand-700" : ""}`}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}
