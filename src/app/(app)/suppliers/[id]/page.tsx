import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { supplierEntries, suppliers, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getOpenCashSession } from "@/lib/cash";
import { getDict } from "@/i18n/server";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "../supplier-form";
import { SupplierAdjustForm, SupplierPaymentForm } from "./debt-forms";

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  const user = await requireUser();
  const isOwner = user.role === "OWNER";
  const { t, locale } = await getDict();
  const id = Number((await params).id);
  const [supplier] = Number.isInteger(id) ? await db.select().from(suppliers).where(eq(suppliers.id, id)) : [];
  if (!supplier) notFound();

  const entries = await db
    .select({ e: supplierEntries, userName: users.name })
    .from(supplierEntries)
    .leftJoin(users, eq(users.id, supplierEntries.userId))
    .where(eq(supplierEntries.supplierId, id))
    .orderBy(asc(supplierEntries.createdAt), asc(supplierEntries.id));

  const history = entries.reduce<((typeof entries)[number] & { after: number })[]>(
    (acc, row) => [...acc, { ...row, after: (acc.at(-1)?.after ?? 0) + row.e.amount }],
    [],
  );
  const balance = history.at(-1)?.after ?? 0;
  history.reverse();
  const cashOpen = !!(await getOpenCashSession());
  const m = (c: number) => formatMoney(c, locale);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={supplier.name}>
        {supplier.phone && (
          <a href={`tel:${supplier.phone}`} className="num btn-secondary">
            {supplier.phone}
          </a>
        )}
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card p-5">
          <div className="text-sm text-muted">{t.suppliers.balance}</div>
          <div className={`num text-4xl font-bold ${balance > 0 ? "text-red-600" : "text-brand-700"}`}>{m(balance)}</div>
          {balance <= 0 && <p className="mt-1 text-sm text-muted">{t.suppliers.paidOff}</p>}
        </div>

        <div className="card p-5">
          <h2 className="mb-1 font-bold">{t.suppliers.payment}</h2>
          <p className="mb-4 text-sm text-muted">{t.suppliers.paymentHelp}</p>
          <SupplierPaymentForm supplierId={supplier.id} balance={balance} cashOpen={cashOpen} isOwner={isOwner} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="p-5 pb-2 font-bold">{t.suppliers.history}</h2>
        {history.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">{t.common.empty}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t.common.date}</th>
                <th>{t.common.status}</th>
                <th>{t.common.amount}</th>
                <th>{t.suppliers.balance}</th>
                <th>{t.common.user}</th>
                <th>{t.common.note}</th>
              </tr>
            </thead>
            <tbody>
              {history.map(({ e, userName, after }) => (
                <tr key={e.id}>
                  <td className="num whitespace-nowrap">{formatDateTime(e.createdAt, locale)}</td>
                  <td>
                    {t.supplierEntryTypes[e.type]}{" "}
                    {e.deliveryId && (
                      <Link href={`/deliveries/${e.deliveryId}`} className="num text-brand-700 hover:underline">
                        R{e.deliveryId}
                      </Link>
                    )}
                    {e.type === "PAYMENT" && (
                      <span className="block text-xs text-muted">{e.cashSessionId ? t.deliveries.fromCash : t.deliveries.outsideCash}</span>
                    )}
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
          <h2 className="mb-4 font-bold">{t.suppliers.editTitle}</h2>
          <SupplierForm supplier={supplier} isOwner={isOwner} />
        </div>
        {isOwner && (
          <div className="card h-fit p-5">
            <h2 className="mb-1 font-bold">{t.customers.adjust}</h2>
            <p className="mb-4 text-sm text-muted">{t.customers.adjustHelp}</p>
            <SupplierAdjustForm supplierId={supplier.id} />
          </div>
        )}
      </div>
    </div>
  );
}
