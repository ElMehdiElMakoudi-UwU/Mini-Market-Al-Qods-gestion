import { getCurrentUser } from "@/lib/auth";
import { getDict } from "@/i18n/server";
import { describeAudit } from "@/lib/audit-describe";
import {
  cashSessionsIn,
  categorySales,
  controlEvents,
  periodParam,
  PRODUCT_SORTS,
  productSales,
  REPORT_VIEWS,
  timeline,
  totals,
} from "@/lib/reports";
import { TIME_ZONE } from "@/lib/format";

type Cell = string | number | null;

// Semicolons and decimal commas: what Excel expects on French/Moroccan setups.
const money = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
const decimal = (n: number, digits = 3) => String(Math.round(n * 10 ** digits) / 10 ** digits).replace(".", ",");
const dateTime = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE, dateStyle: "short", timeStyle: "short" }).format(d) : "";

function csv(rows: Cell[][]) {
  const cell = (v: Cell) => {
    const s = v === null ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "OWNER") return new Response("Forbidden", { status: 403 });
  const { t, locale } = await getDict();
  const r = t.reports;
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const period = periodParam(sp);
  const view = REPORT_VIEWS.find((v) => v === sp.view) ?? "summary";
  const name = (o: { nameFr: string | null; nameAr: string | null }) => (locale === "ar" && o.nameAr ? o.nameAr : o.nameFr) ?? "";
  let rows: Cell[][];

  if (view === "summary") {
    const [s, line] = await Promise.all([totals(period), timeline(period)]);
    rows = [
      [r.revenue, money(s.revenue)],
      [r.cost, money(s.cost)],
      [r.grossProfit, money(s.grossProfit)],
      [r.margin, decimal(s.margin * 100, 1)],
      [r.expenses, money(s.expenses)],
      [r.losses, money(s.losses)],
      [r.netProfit, money(s.netProfit)],
      [r.salesCount, s.count],
      [r.avgBasket, money(s.avgBasket)],
      [r.creditGiven, money(s.creditGiven)],
      [r.creditRepaid, money(s.creditRepaid)],
      [r.voided, s.voidCount, money(s.voidTotal)],
      [],
      [line.monthly ? r.month : r.day, r.salesCount, r.revenue, r.grossProfit],
      ...line.rows.map((d) => [line.monthly ? d.bucket.slice(0, 7) : d.bucket, d.count, money(d.revenue), money(d.profit)]),
    ];
  } else if (view === "products") {
    const sort = PRODUCT_SORTS.find((s) => s === sp.sort) ?? "revenue";
    const list = await productSales(period, sort);
    rows = [
      [r.product, r.qty, r.revenue, r.cost, r.grossProfit, `${r.margin} %`, r.stock],
      ...list.map((p) => [name(p), decimal(p.qty), money(p.revenue), money(p.cost), money(p.profit), decimal(p.margin * 100, 1), decimal(p.stock)]),
    ];
  } else if (view === "categories") {
    const list = await categorySales(period);
    rows = [
      [r.category, r.revenue, r.cost, r.grossProfit, r.products],
      ...list.map((c) => [c.id ? name(c) : r.noCategory, money(c.revenue), money(c.cost), money(c.revenue - c.cost), c.products]),
    ];
  } else if (view === "cash") {
    const list = await cashSessionsIn(period);
    rows = [
      [r.opened, t.common.user, r.closed, t.common.user, r.openingCash, r.expected, r.counted, r.difference, t.common.note],
      ...list.map((s) => [
        dateTime(s.openedAt),
        s.openedBy,
        dateTime(s.closedAt),
        s.closedBy,
        money(s.openingCash),
        money(s.expected),
        money(s.counted),
        money(s.difference),
        s.note,
      ]),
    ];
  } else {
    const list = await controlEvents(period);
    const labels = { ...t.expenseCategories, ...t.lossReasons };
    rows = [
      [t.common.date, t.common.user, t.activity.action, r.details],
      ...list.map((e) => [dateTime(e.createdAt), e.userName, t.auditActions[e.action] ?? e.action, describeAudit(e.details as Record<string, unknown>, locale, labels)]),
    ];
  }

  const filename = `rapport-${view}-${period.from}_${period.to}.csv`;
  return new Response(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
