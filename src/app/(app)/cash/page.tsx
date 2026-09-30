import { desc, eq, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { cashMovements, cashSessions, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { cashSummary, getOpenCashSession } from "@/lib/cash";
import { getDict } from "@/i18n/server";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { CloseCashForm, MovementForm, OpenCashForm } from "./forms";

export default async function CashPage() {
  await requireUser();
  const { t, locale } = await getDict();
  const session = await getOpenCashSession();
  const summary = session ? await cashSummary(session.id, session.openingCash) : null;
  const movements = session
    ? await db
        .select({ m: cashMovements, userName: users.name })
        .from(cashMovements)
        .innerJoin(users, eq(users.id, cashMovements.userId))
        .where(eq(cashMovements.cashSessionId, session.id))
        .orderBy(desc(cashMovements.createdAt))
    : [];

  const closer = alias(users, "closer");
  const history = await db
    .select({ s: cashSessions, openedBy: users.name, closedBy: closer.name })
    .from(cashSessions)
    .innerJoin(users, eq(users.id, cashSessions.openedById))
    .leftJoin(closer, eq(closer.id, cashSessions.closedById))
    .where(isNotNull(cashSessions.closedAt))
    .orderBy(desc(cashSessions.closedAt))
    .limit(15);

  const m = (c: number) => formatMoney(c, locale);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t.cash.title} />

      {!session || !summary ? (
        <div className="card p-6">
          <p className="mb-4 text-muted">{t.cash.closedState}</p>
          <OpenCashForm />
        </div>
      ) : (
        <>
          <div className="card p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="badge bg-brand-100 text-brand-700">{t.cash.openState}</span>
              <span className="text-sm text-muted">
                {t.cash.openedBy} {session.openedByName} · <span className="num">{formatDateTime(session.openedAt, locale)}</span>
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Stat label={t.cash.openingCash} value={m(session.openingCash)} />
              <Stat label={`${t.cash.salesCash} (${summary.salesCount})`} value={m(summary.salesTotal)} />
              <Stat label={t.cash.creditPayments} value={m(summary.creditPayments)} />
              <Stat label={t.cash.cashIn} value={m(summary.cashIn)} />
              <Stat label={t.cash.cashOut} value={m(summary.cashOut)} />
              <Stat label={t.cash.supplierPayments} value={m(summary.supplierPayments)} />
              <Stat label={t.cash.expenses} value={m(summary.expenses)} />
              <Stat label={t.cash.expected} value={m(summary.expected)} strong />
            </dl>
            {summary.creditSales > 0 && (
              <p className="mt-3 text-sm text-muted">
                {t.cash.creditSales}: <span className="num font-semibold text-ink">{m(summary.creditSales)}</span>
              </p>
            )}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="card p-5">
              <h2 className="mb-1 font-bold">{t.cash.movement}</h2>
              <p className="mb-4 text-sm text-muted">{t.cash.movementHelp}</p>
              <MovementForm />
              {movements.length > 0 && (
                <ul className="mt-4 divide-y divide-line text-sm">
                  {movements.map(({ m: mv, userName }) => (
                    <li key={mv.id} className="flex justify-between gap-2 py-2">
                      <span>
                        {mv.reason}
                        <span className="block text-xs text-muted">
                          {userName} · <span className="num">{formatDateTime(mv.createdAt, locale)}</span>
                        </span>
                      </span>
                      <span className={`num font-semibold ${mv.type === "IN" ? "text-brand-600" : "text-red-600"}`}>
                        {mv.type === "IN" ? "+" : "−"}
                        {m(mv.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card p-5">
              <h2 className="mb-1 font-bold">{t.cash.close}</h2>
              <p className="mb-4 text-sm text-muted">{t.cash.closeHelp}</p>
              <CloseCashForm />
            </div>
          </div>
        </>
      )}

      <div className="card overflow-x-auto">
        <h2 className="p-5 pb-2 font-bold">{t.cash.history}</h2>
        {history.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">{t.common.empty}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t.cash.closedAt}</th>
                <th>{t.common.user}</th>
                <th>{t.cash.expected}</th>
                <th>{t.cash.counted}</th>
                <th>{t.cash.difference}</th>
              </tr>
            </thead>
            <tbody>
              {history.map(({ s, openedBy, closedBy }) => (
                <tr key={s.id}>
                  <td className="num">{formatDateTime(s.closedAt!, locale)}</td>
                  <td>{closedBy ?? openedBy}</td>
                  <td className="num">{m(s.expectedCash ?? 0)}</td>
                  <td className="num">{m(s.countedCash ?? 0)}</td>
                  <td className={`num font-semibold ${(s.difference ?? 0) < 0 ? "text-red-600" : (s.difference ?? 0) > 0 ? "text-amber-600" : "text-brand-600"}`}>
                    {m(s.difference ?? 0)}
                    {s.note && <span className="block text-xs font-normal text-muted">{s.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${strong ? "bg-brand-50" : "bg-surface"}`}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`num mt-1 ${strong ? "text-xl font-bold text-brand-700" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}
