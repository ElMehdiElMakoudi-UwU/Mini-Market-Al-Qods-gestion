import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenses, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getOpenCashSession } from "@/lib/cash";
import { getDict } from "@/i18n/server";
import { formatMoney, monthParam, todayInMorocco } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { DeleteExpenseButton, ExpenseForm } from "./expense-form";

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const user = await requireUser();
  const isOwner = user.role === "OWNER";
  const { t, locale } = await getDict();
  const month = monthParam((await searchParams).month);
  const inMonth = sql`to_char(${expenses.date}, 'YYYY-MM') = ${month}`;

  const [rows, session] = await Promise.all([
    db
      .select({ e: expenses, userName: users.name })
      .from(expenses)
      .innerJoin(users, eq(users.id, expenses.userId))
      .where(inMonth)
      .orderBy(desc(expenses.date), desc(expenses.id)),
    getOpenCashSession(),
  ]);
  const total = rows.reduce((s, r) => s + r.e.amount, 0);
  const byCategory = [...Map.groupBy(rows, (r) => r.e.category)]
    .map(([category, list]) => ({ category, total: list.reduce((s, r) => s + r.e.amount, 0) }))
    .sort((a, b) => b.total - a.total);
  const m = (c: number) => formatMoney(c, locale);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t.expenses.title} />

      <div className="card p-5">
        <h2 className="mb-4 font-bold">{t.expenses.new}</h2>
        <ExpenseForm isOwner={isOwner} cashOpen={!!session} today={todayInMorocco()} />
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-3">
        <div>
          <label className="label">{t.expenses.month}</label>
          <input type="month" name="month" defaultValue={month} className="input" />
        </div>
        <button className="btn-secondary">{t.sales.filter}</button>
        <div className="ms-auto text-end">
          <div className="text-sm text-muted">{t.expenses.monthTotal}</div>
          <div className="num text-2xl font-bold text-red-600">{m(total)}</div>
        </div>
      </form>

      {byCategory.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 font-bold">{t.expenses.byCategory}</h2>
          <ul className="space-y-2 text-sm">
            {byCategory.map((c) => (
              <li key={c.category}>
                <div className="flex justify-between">
                  <span>{t.expenseCategories[c.category]}</span>
                  <span className="num font-semibold">{m(c.total)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surface">
                  <div className="h-1.5 rounded-full bg-red-400" style={{ width: `${(c.total / total) * 100}%` }} />
                </div>
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
                <th>{t.expenses.date}</th>
                <th>{t.expenses.category}</th>
                <th>{t.common.amount}</th>
                <th>{t.expenses.source}</th>
                <th>{t.common.user}</th>
                {isOwner && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, userName }) => (
                <tr key={e.id}>
                  <td className="num whitespace-nowrap">{e.date.split("-").reverse().join("/")}</td>
                  <td>
                    {t.expenseCategories[e.category]}
                    {e.note && <span className="block text-xs text-muted">{e.note}</span>}
                  </td>
                  <td className="num font-semibold">{m(e.amount)}</td>
                  <td className="text-sm text-muted">{e.cashSessionId ? t.expenses.fromCash : t.expenses.outsideCash}</td>
                  <td>{userName}</td>
                  {isOwner && (
                    <td>
                      <DeleteExpenseButton id={e.id} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
