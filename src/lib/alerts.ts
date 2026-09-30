import { and, eq, gt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertSettings, appState, auditLogs, creditEntries, customers, products, pushSubscriptions, sales, stockMovements, users } from "@/db/schema";
import { fr } from "@/i18n/fr";
import { ar } from "@/i18n/ar";
import { describeAudit } from "./audit-describe";
import { expiringBatches, SOON_DAYS } from "./expiry";
import { formatMoney, formatQty, TIME_ZONE, todayInMorocco } from "./format";
import { getState, sendPush, setState, type PushPayload } from "./push";

// Not marked server-only: it runs from instrumentation, outside React.

/** Alerts an owner can turn on or off. */
export const ALERT_KINDS = [
  "cash_open",
  "cash_close",
  "cash_movement",
  "expense",
  "supplier_payment",
  "delivery",
  "loss",
  "low_stock",
  "credit_limit",
  "daily",
  "login",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

// Activity log entries that become alerts. Owner-only actions (voids, price
// changes…) are left out: the owner is never alerted about their own actions.
const ACTION_KIND: Record<string, AlertKind> = {
  cash_open: "cash_open",
  cash_close: "cash_close",
  cash_movement: "cash_movement",
  expense_create: "expense",
  supplier_payment: "supplier_payment",
  delivery_create: "delivery",
  loss_create: "loss",
  login: "login",
};

const TICK_MS = 60_000;
// Rows are read a little after they are written so a transaction that started
// earlier but committed later is not skipped by the cursor.
const SETTLE = sql`now() - interval '20 seconds'`;
// After downtime, don't send a flood of stale alerts.
const MAX_AGE_MS = 6 * 3600_000;
const DIGEST_HOUR = 8;

type Recipient = { userId: number; muted: string[]; cashThreshold: number; locale: "fr" | "ar" };
type Alert = { kind: AlertKind; actorId?: number | null; payload: (r: Recipient) => PushPayload; urgent?: (r: Recipient) => boolean };

/** Owners with at least one device, and what they want to receive. */
async function recipients(): Promise<Recipient[]> {
  const rows = await db
    .selectDistinct({ userId: users.id, muted: alertSettings.muted, cashThreshold: alertSettings.cashThreshold, locale: alertSettings.locale })
    .from(users)
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, users.id))
    .leftJoin(alertSettings, eq(alertSettings.userId, users.id))
    .where(and(eq(users.role, "OWNER"), eq(users.active, true)));
  return rows.map((r) => ({
    userId: r.userId,
    muted: r.muted ?? ["login"],
    cashThreshold: r.cashThreshold ?? 1000,
    locale: r.locale === "ar" ? "ar" : "fr",
  }));
}

const dict = (r: Recipient) => (r.locale === "ar" ? ar : fr);

/**
 * Reads rows past a stored cursor. The first run starts from the newest row,
 * so turning alerts on never replays history.
 */
async function sinceCursor<T extends { id: number }>(key: string, maxId: () => Promise<number>, read: (after: number) => Promise<T[]>) {
  const cursor = await getState<number>(key);
  if (cursor === undefined) {
    await setState(key, await maxId());
    return [];
  }
  const rows = await read(cursor);
  if (rows.length) await setState(key, rows[rows.length - 1].id);
  return rows;
}

async function activityAlerts(): Promise<Alert[]> {
  const rows = await sinceCursor(
    "alerts.audit",
    async () => (await db.select({ id: sql<number>`coalesce(max(${auditLogs.id}), 0)::int` }).from(auditLogs))[0].id,
    (after) =>
      db
        .select({ id: auditLogs.id, a: auditLogs, userName: users.name })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.userId))
        .where(and(gt(auditLogs.id, after), lte(auditLogs.createdAt, SETTLE)))
        .orderBy(auditLogs.id)
        .limit(500),
  );
  const alerts: Alert[] = [];
  for (const { a, userName } of rows) {
    const kind = ACTION_KIND[a.action];
    if (!kind || Date.now() - a.createdAt.getTime() > MAX_AGE_MS) continue;
    const d = a.details as Record<string, unknown>;
    const who = userName ?? "";
    if (kind === "cash_close") {
      const diff = Number(d.difference ?? 0);
      const flagged = (r: Recipient) => diff !== 0 && Math.abs(diff) >= r.cashThreshold;
      alerts.push({
        kind,
        actorId: a.userId,
        urgent: flagged,
        payload: (r) => {
          const t = dict(r);
          const m = (c: number) => formatMoney(c, r.locale);
          return {
            title: flagged(r) ? `${t.alerts.cashDiffTitle} ${m(diff)}` : t.auditActions.cash_close,
            body: [who, `${t.alerts.counted} ${m(Number(d.counted ?? 0))}`, `${t.alerts.difference} ${m(diff)}`].join(" · "),
            url: "/cash",
            tag: `cash-${d.sessionId}`,
          };
        },
      });
      continue;
    }
    const url =
      kind === "expense" ? "/expenses"
      : kind === "loss" ? "/losses"
      : kind === "supplier_payment" ? `/suppliers/${d.supplierId}`
      : kind === "delivery" ? `/deliveries/${d.deliveryId}`
      : kind === "login" ? "/activity"
      : "/cash";
    alerts.push({
      kind,
      actorId: a.userId,
      payload: (r) => {
        const t = dict(r);
        const details = describeAudit(d, r.locale, { ...t.expenseCategories, ...t.lossReasons });
        return { title: t.auditActions[a.action] ?? a.action, body: [who, details].filter(Boolean).join(" · "), url, tag: `audit-${a.id}` };
      },
    });
  }
  return alerts;
}

/** Products whose stock just fell to or below their minimum. */
async function lowStockAlerts(): Promise<Alert[]> {
  const rows = await sinceCursor(
    "alerts.stock",
    async () => (await db.select({ id: sql<number>`coalesce(max(${stockMovements.id}), 0)::int` }).from(stockMovements))[0].id,
    (after) =>
      db
        .select({
          id: stockMovements.id,
          quantity: stockMovements.quantity,
          stockAfter: stockMovements.stockAfter,
          createdAt: stockMovements.createdAt,
          p: { id: products.id, nameFr: products.nameFr, nameAr: products.nameAr, unit: products.unit, minStock: products.minStock, active: products.active },
        })
        .from(stockMovements)
        .innerJoin(products, eq(products.id, stockMovements.productId))
        .where(and(gt(stockMovements.id, after), lte(stockMovements.createdAt, SETTLE)))
        .orderBy(stockMovements.id)
        .limit(2000),
  );
  const crossed = new Map<number, (typeof rows)[number]>();
  for (const m of rows) {
    const before = m.stockAfter - m.quantity;
    if (!m.p.active || m.p.minStock <= 0 || Date.now() - m.createdAt.getTime() > MAX_AGE_MS) continue;
    if (m.stockAfter <= m.p.minStock && before > m.p.minStock) crossed.set(m.p.id, m);
  }
  if (crossed.size === 0) return [];
  const list = [...crossed.values()];
  return [
    {
      kind: "low_stock",
      payload: (r) => {
        const t = dict(r);
        const name = (m: (typeof list)[number]) => (r.locale === "ar" && m.p.nameAr ? m.p.nameAr : m.p.nameFr);
        const shown = list.slice(0, 4).map((m) => `${name(m)} (${formatQty(m.stockAfter, m.p.unit)})`);
        if (list.length > 4) shown.push(t.alerts.andMore.replace("{n}", String(list.length - 4)));
        return {
          title: t.alerts.lowStockTitle,
          body: shown.join(", "),
          url: list.length === 1 ? `/products/${list[0].p.id}` : "/dashboard",
          tag: `stock-${list.map((m) => m.p.id).join("-")}`,
        };
      },
    },
  ];
}

/** Credit sales that left a customer above their limit. */
async function creditLimitAlerts(): Promise<Alert[]> {
  const rows = await sinceCursor(
    "alerts.credit",
    async () => (await db.select({ id: sql<number>`coalesce(max(${creditEntries.id}), 0)::int` }).from(creditEntries))[0].id,
    (after) =>
      db
        .select({
          id: creditEntries.id,
          type: creditEntries.type,
          amount: creditEntries.amount,
          userId: creditEntries.userId,
          // Offline sales carry the time they were made; use when they reached the server.
          receivedAt: sql<Date>`coalesce(${sales.syncedAt}, ${creditEntries.createdAt})`.mapWith(creditEntries.createdAt),
          customerId: customers.id,
          name: customers.name,
          creditLimit: customers.creditLimit,
          balance: sql<number>`(select coalesce(sum(e.amount), 0)::int from ${creditEntries} e where e.customer_id = ${creditEntries.customerId} and e.id <= ${creditEntries.id})`,
        })
        .from(creditEntries)
        .innerJoin(customers, eq(customers.id, creditEntries.customerId))
        .leftJoin(sales, eq(sales.id, creditEntries.saleId))
        .where(and(gt(creditEntries.id, after), sql`coalesce(${sales.syncedAt}, ${creditEntries.createdAt}) <= ${SETTLE}`))
        .orderBy(creditEntries.id)
        .limit(500),
  );
  return rows
    .filter((e) => e.type === "SALE" && e.creditLimit > 0 && e.balance > e.creditLimit && Date.now() - e.receivedAt.getTime() <= MAX_AGE_MS)
    .map((e) => ({
      kind: "credit_limit" as const,
      actorId: e.userId,
      urgent: () => true,
      payload: (r: Recipient) => {
        const t = dict(r);
        const m = (c: number) => formatMoney(c, r.locale);
        return { title: t.alerts.creditLimitTitle, body: `${e.name} · ${m(e.balance)} / ${m(e.creditLimit)}`, url: `/customers/${e.customerId}`, tag: `credit-${e.id}` };
      },
    }));
}

/** Once a day after 8:00: yesterday's sales, expiry and low stock. */
async function dailyDigest(): Promise<Alert[]> {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const today = todayInMorocco();
  if (hour < DIGEST_HOUR || (await getState<string>("alerts.digest")) === today) return [];
  await setState("alerts.digest", today);

  const [y] = await db
    .select({ revenue: sql<number>`coalesce(sum(${sales.total}), 0)::int`, count: sql<number>`count(*)::int` })
    .from(sales)
    .where(
      and(
        eq(sales.status, "COMPLETED"),
        sql`(${sales.createdAt} at time zone ${TIME_ZONE})::date = (now() at time zone ${TIME_ZONE})::date - 1`,
      ),
    );
  const urgent = await expiringBatches(SOON_DAYS);
  const expired = new Set(urgent.filter((b) => b.daysLeft < 0).map((b) => b.productId)).size;
  const soon = new Set(urgent.filter((b) => b.daysLeft >= 0).map((b) => b.productId)).size;
  const [{ low }] = await db
    .select({ low: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.active, true), sql`${products.minStock} > 0`, lte(products.stock, products.minStock)));

  return [
    {
      kind: "daily",
      urgent: () => expired > 0,
      payload: (r) => {
        const t = dict(r);
        const parts = [`${t.alerts.yesterday} : ${formatMoney(y.revenue, r.locale)} (${y.count} ${t.alerts.salesWord})`];
        if (expired) parts.push(`${expired} ${t.alerts.expired}`);
        if (soon) parts.push(`${soon} ${t.alerts.expiringSoon}`);
        if (low) parts.push(`${low} ${t.alerts.lowStockCount}`);
        return { title: t.alerts.digestTitle, body: parts.join(" · "), url: "/dashboard", tag: `daily-${today}` };
      },
    },
  ];
}

/**
 * Takes the worker lease for a minute. Only one server process advances the
 * cursors at a time, e.g. while Coolify runs the old and new containers.
 */
async function takeLease(): Promise<boolean> {
  await db.insert(appState).values({ key: "alerts.lease", value: 0 }).onConflictDoNothing();
  const until = Date.now() + TICK_MS - 5_000;
  const taken = await db
    .update(appState)
    .set({ value: until })
    .where(and(eq(appState.key, "alerts.lease"), sql`(${appState.value})::bigint < ${Date.now()}`))
    .returning();
  return taken.length > 0;
}

/** One pass: collects what happened since the last pass and notifies owners. */
export async function runAlerts() {
  if (!(await takeLease())) return;
  const people = await recipients();
  // Cursors keep moving even with nobody subscribed, so enabling alerts later starts fresh.
  const alerts = [...(await activityAlerts()), ...(await lowStockAlerts()), ...(await creditLimitAlerts()), ...(await dailyDigest())];
  for (const alert of alerts) {
    for (const r of people) {
      if (r.muted.includes(alert.kind) || alert.actorId === r.userId) continue;
      await sendPush([r.userId], alert.payload(r), alert.urgent?.(r) ?? false);
    }
  }
}

const globalForAlerts = globalThis as unknown as { alertTimer?: NodeJS.Timeout };

export function startAlertWorker() {
  if (globalForAlerts.alertTimer) return;
  const tick = () => runAlerts().catch((e) => console.error("Alerts failed", e));
  globalForAlerts.alertTimer = setInterval(tick, TICK_MS);
  setTimeout(tick, 10_000);
}
