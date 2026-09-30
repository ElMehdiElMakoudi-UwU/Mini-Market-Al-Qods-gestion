import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditEntries, customers, sales, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getOpenCashSession } from "@/lib/cash";
import { getDict } from "@/i18n/server";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { CustomerForm } from "../customer-form";
import { AdjustForm, PaymentForm } from "./credit-forms";

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const user = await requireUser();
  const isOwner = user.role === "OWNER";
  const { t, locale } = await getDict();
  const id = Number((await params).id);
  const [customer] = Number.isInteger(id) ? await db.select().from(customers).where(eq(customers.id, id)) : [];
  if (!customer) notFound();

  const entries = await db
    .select({ e: creditEntries, userName: users.name, saleNumber: sales.number })
    .from(creditEntries)
    .leftJoin(users, eq(users.id, creditEntries.userId))
    .leftJoin(sales, eq(sales.id, creditEntries.saleId))
    .where(eq(creditEntries.customerId, id))
    .orderBy(asc(creditEntries.createdAt), asc(creditEntries.id));

  const history = entries.reduce<((typeof entries)[number] & { after: number })[]>(
    (acc, row) => [...acc, { ...row, after: (acc.at(-1)?.after ?? 0) + row.e.amount }],
    [],
  );
  const balance = history.at(-1)?.after ?? 0;
  history.reverse();
  const over = customer.creditLimit > 0 && balance > customer.creditLimit;
  const cashOpen = !!(await getOpenCashSession());
  const m = (c: number) => formatMoney(c, locale);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={customer.name}>
        {customer.phone && (
          <a href={`tel:${customer.phone}`} className="num btn-secondary">
            {customer.phone}
          </a>
        )}
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card p-5">
          <div className="text-sm text-muted">{t.customers.balance}</div>
          <div className={`num text-4xl font-bold ${balance > 0 ? "text-red-600" : "text-brand-700"}`}>{m(balance)}</div>
          {balance <= 0 && <p className="mt-1 text-sm text-muted">{t.customers.paidOff}</p>}
          <p className="mt-2 text-sm text-muted">
            {t.pos.limit}: <span className="num">{customer.creditLimit > 0 ? m(customer.creditLimit) : t.customers.noLimit}</span>
            {over && <span className="badge ms-2 bg-red-100 text-red-700">{t.customers.overLimit}</span>}
          </p>
          {customer.note && <p className="mt-2 text-sm">{customer.note}</p>}
        </div>

        <div className="card p-5">
          <h2 className="mb-1 font-bold">{t.customers.payment}</h2>
          <p className="mb-4 text-sm text-muted">{t.customers.paymentHelp}</p>
          <PaymentForm customerId={customer.id} balance={balance} cashOpen={cashOpen} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="p-5 pb-2 font-bold">{t.customers.history}</h2>
        {history.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">{t.common.empty}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t.common.date}</th>
                <th>{t.common.status}</th>
                <th>{t.common.amount}</th>
                <th>{t.customers.balance}</th>
                <th>{t.common.user}</th>
                <th>{t.common.note}</th>
              </tr>
            </thead>
            <tbody>
              {history.map(({ e, userName, saleNumber, after }) => (
                <tr key={e.id}>
                  <td className="num whitespace-nowrap">{formatDateTime(e.createdAt, locale)}</td>
                  <td>
                    {t.creditTypes[e.type]} {saleNumber && <span className="num text-muted">#{saleNumber}</span>}
                  </td>
                  <td className={`num font-semibold ${e.amount > 0 ? "text-red-600" : "text-brand-600"}`}>
                    {e.amount > 0 ? "+" : "−"}
                    {m(Math.abs(e.amount))}
                  </td>
                  <td className="num">{m(after)}</td>
                  <td>{userName}</td>
                  <td className="text-muted">{e.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="card p-5">
          <h2 className="mb-4 font-bold">{t.customers.editTitle}</h2>
          <CustomerForm customer={customer} isOwner={isOwner} />
        </div>
        {isOwner && (
          <div className="card h-fit p-5">
            <h2 className="mb-1 font-bold">{t.customers.adjust}</h2>
            <p className="mb-4 text-sm text-muted">{t.customers.adjustHelp}</p>
            <AdjustForm customerId={customer.id} />
          </div>
        )}
      </div>
    </div>
  );
}
