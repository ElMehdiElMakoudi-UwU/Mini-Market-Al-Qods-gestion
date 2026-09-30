import "server-only";
import { and, asc, desc, eq, inArray, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { auditLogs, cashSessions, categories, creditEntries, expenses, losses, products, saleItems, sales, users } from "@/db/schema";
import { TIME_ZONE, todayInMorocco } from "./format";

export type Period = { from: string; to: string };
export const REPORT_VIEWS = ["summary", "products", "categories", "cash", "controls"] as const;
export type ReportView = (typeof REPORT_VIEWS)[number];
export const PRESETS = ["today", "yesterday", "last7", "month", "lastMonth", "year"] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysIn(p: Period) {
  return Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86400_000) + 1;
}

export function presetPeriod(preset: (typeof PRESETS)[number]): Period {
  const today = todayInMorocco();
  const month = today.slice(0, 7);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "month":
      return { from: `${month}-01`, to: today };
    case "lastMonth": {
      const end = addDays(`${month}-01`, -1);
      return { from: `${end.slice(0, 7)}-01`, to: end };
    }
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/** The period from search params; defaults to the current month. */
export function periodParam(sp: Record<string, string | string[] | undefined>): Period {
  const preset = PRESETS.find((p) => p === sp.preset);
  if (preset) return presetPeriod(preset);
  const from = typeof sp.from === "string" && DAY.test(sp.from) ? sp.from : presetPeriod("month").from;
  const to = typeof sp.to === "string" && DAY.test(sp.to) ? sp.to : todayInMorocco();
  return from <= to ? { from, to } : { from: to, to: from };
}

/** The same number of days just before `p`, for comparison. */
export function previousPeriod(p: Period): Period {
  const n = daysIn(p);
  return { from: addDays(p.from, -n), to: addDays(p.from, -1) };
}

const localDay = (col: SQL | AnyColumn) => sql`(${col} at time zone ${TIME_ZONE})::date`;
const within = (col: SQL | AnyColumn, p: Period) => sql`${localDay(col)} between ${p.from}::date and ${p.to}::date`;
const completedIn = (p: Period) => and(eq(sales.status, "COMPLETED"), within(sales.createdAt, p));

const lineCost = sql`round(${saleItems.unitCost} * ${saleItems.quantity})`;
const revenueSql = sql<number>`coalesce(sum(${saleItems.lineTotal}), 0)::int`;
const costSql = sql<number>`coalesce(sum(${lineCost}), 0)::int`;

export async function totals(p: Period) {
  const [items] = await db
    .select({ revenue: revenueSql, cost: costSql })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(completedIn(p));
  const [s] = await db
    .select({
      count: sql<number>`count(*) filter (where ${sales.status} = 'COMPLETED')::int`,
      credit: sql<number>`coalesce(sum(${sales.creditAmount}) filter (where ${sales.status} = 'COMPLETED'), 0)::int`,
      voidCount: sql<number>`count(*) filter (where ${sales.status} = 'VOIDED')::int`,
      voidTotal: sql<number>`coalesce(sum(${sales.total}) filter (where ${sales.status} = 'VOIDED'), 0)::int`,
    })
    .from(sales)
    .where(within(sales.createdAt, p));
  const [ex] = await db
    .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)::int` })
    .from(expenses)
    .where(sql`${expenses.date} between ${p.from}::date and ${p.to}::date`);
  const [lo] = await db
    .select({ total: sql<number>`coalesce(sum(round(${losses.unitCost} * ${losses.quantity})), 0)::int` })
    .from(losses)
    .where(within(losses.createdAt, p));
  const [cr] = await db
    .select({ repaid: sql<number>`coalesce(-sum(${creditEntries.amount}) filter (where ${creditEntries.type} = 'PAYMENT'), 0)::int` })
    .from(creditEntries)
    .where(within(creditEntries.createdAt, p));
  const grossProfit = items.revenue - items.cost;
  return {
    revenue: items.revenue,
    cost: items.cost,
    grossProfit,
    margin: items.revenue ? grossProfit / items.revenue : 0,
    count: s.count,
    avgBasket: s.count ? Math.round(items.revenue / s.count) : 0,
    creditGiven: s.credit,
    creditRepaid: cr.repaid,
    voidCount: s.voidCount,
    voidTotal: s.voidTotal,
    expenses: ex.total,
    losses: lo.total,
    netProfit: grossProfit - ex.total - lo.total,
  };
}
export type Totals = Awaited<ReturnType<typeof totals>>;

/** Revenue and profit per day, or per month for long periods. */
export async function timeline(p: Period) {
  const monthly = daysIn(p) > 62;
  const step = monthly ? sql`'1 month'::interval` : sql`'1 day'::interval`;
  const bucket = monthly ? sql`date_trunc('month', ${localDay(sales.createdAt)})::date` : localDay(sales.createdAt);
  const start = monthly ? sql`date_trunc('month', ${p.from}::date)` : sql`${p.from}::date`;
  const rows = await db.execute<{ bucket: string; revenue: number; profit: number; count: number }>(sql`
    with agg as (
      select ${bucket} as bucket,
        sum(${saleItems.lineTotal})::int as revenue,
        sum(${saleItems.lineTotal} - ${lineCost})::int as profit,
        count(distinct ${sales.id})::int as count
      from ${saleItems} join ${sales} on ${sales.id} = ${saleItems.saleId}
      where ${completedIn(p)}
      group by 1
    )
    select to_char(g.bucket, 'YYYY-MM-DD') as bucket, coalesce(a.revenue, 0) as revenue, coalesce(a.profit, 0) as profit, coalesce(a.count, 0) as count
    from generate_series(${start}, ${p.to}::date, ${step}) as g(bucket)
    left join agg a on a.bucket = g.bucket::date
    order by g.bucket`);
  return { monthly, rows: [...rows] };
}

/** Sales per hour of the day, to see busy hours. */
export async function byHour(p: Period) {
  const rows = await db
    .select({
      hour: sql<number>`extract(hour from ${sales.createdAt} at time zone ${TIME_ZONE})::int`,
      revenue: sql<number>`sum(${sales.total})::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(sales)
    .where(completedIn(p))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows;
}

export async function bySeller(p: Period) {
  return db
    .select({ name: users.name, revenue: sql<number>`sum(${sales.total})::int`, count: sql<number>`count(*)::int` })
    .from(sales)
    .innerJoin(users, eq(users.id, sales.userId))
    .where(completedIn(p))
    .groupBy(users.id, users.name)
    .orderBy(desc(sql`sum(${sales.total})`));
}

export const PRODUCT_SORTS = ["revenue", "profit", "qty", "margin"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export async function productSales(p: Period, sort: ProductSort = "revenue") {
  const rows = await db
    .select({
      id: products.id,
      nameFr: products.nameFr,
      nameAr: products.nameAr,
      unit: products.unit,
      stock: products.stock,
      qty: sql<number>`sum(${saleItems.quantity})::float8`,
      revenue: revenueSql,
      cost: costSql,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(products, eq(products.id, saleItems.productId))
    .where(completedIn(p))
    .groupBy(products.id);
  const withProfit = rows.map((r) => ({ ...r, profit: r.revenue - r.cost, margin: r.revenue ? (r.revenue - r.cost) / r.revenue : 0 }));
  return withProfit.sort((a, b) => b[sort] - a[sort]);
}
export type ProductRow = Awaited<ReturnType<typeof productSales>>[number];

/** Products in stock that sold nothing in the period, with the money they hold. */
export async function unsoldProducts(p: Period) {
  const sold = db
    .selectDistinct({ id: saleItems.productId })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(completedIn(p));
  return db
    .select({
      id: products.id,
      nameFr: products.nameFr,
      nameAr: products.nameAr,
      unit: products.unit,
      stock: products.stock,
      value: sql<number>`round(${products.stock} * ${products.costPrice})::int`,
    })
    .from(products)
    .where(and(eq(products.active, true), sql`${products.stock} > 0`, sql`${products.id} not in ${sold}`))
    .orderBy(desc(sql`${products.stock} * ${products.costPrice}`));
}

export async function categorySales(p: Period) {
  return db
    .select({
      id: categories.id,
      nameFr: categories.nameFr,
      nameAr: categories.nameAr,
      revenue: revenueSql,
      cost: costSql,
      products: sql<number>`count(distinct ${products.id})::int`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(products, eq(products.id, saleItems.productId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(completedIn(p))
    .groupBy(categories.id)
    .orderBy(desc(revenueSql));
}

const openedBy = alias(users, "opened_by");
const closedBy = alias(users, "closed_by");

/** Register sessions opened in the period, with their closing difference. */
export async function cashSessionsIn(p: Period) {
  return db
    .select({
      id: cashSessions.id,
      openedAt: cashSessions.openedAt,
      closedAt: cashSessions.closedAt,
      openedBy: openedBy.name,
      closedBy: closedBy.name,
      openingCash: cashSessions.openingCash,
      expected: cashSessions.expectedCash,
      counted: cashSessions.countedCash,
      difference: cashSessions.difference,
      note: cashSessions.note,
    })
    .from(cashSessions)
    .innerJoin(openedBy, eq(openedBy.id, cashSessions.openedById))
    .leftJoin(closedBy, eq(closedBy.id, cashSessions.closedById))
    .where(within(cashSessions.openedAt, p))
    .orderBy(asc(cashSessions.openedAt));
}

// Actions that change money or stock outside a normal sale.
export const CONTROL_ACTIONS = [
  "sale_void",
  "price_change",
  "stock_adjust",
  "loss_create",
  "cash_movement",
  "credit_adjust",
  "supplier_adjust",
  "expense_delete",
  "batch_clear",
  "stock_count_approve",
];

export async function controlEvents(p: Period) {
  return db
    .select({ id: auditLogs.id, action: auditLogs.action, details: auditLogs.details, createdAt: auditLogs.createdAt, userName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(and(inArray(auditLogs.action, CONTROL_ACTIONS), within(auditLogs.createdAt, p)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(1000);
}

export async function lossesByReason(p: Period) {
  return db
    .select({
      reason: losses.reason,
      count: sql<number>`count(*)::int`,
      total: sql<number>`sum(round(${losses.unitCost} * ${losses.quantity}))::int`,
    })
    .from(losses)
    .where(within(losses.createdAt, p))
    .groupBy(losses.reason)
    .orderBy(desc(sql`3`));
}
