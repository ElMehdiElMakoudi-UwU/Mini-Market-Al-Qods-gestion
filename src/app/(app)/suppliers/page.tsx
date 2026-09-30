import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deliveries, suppliers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/i18n/server";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "./supplier-form";

export default async function SuppliersPage() {
  await requireUser();
  const { t, locale } = await getDict();
  const rows = await db
    .select({
      s: suppliers,
      count: sql<number>`count(${deliveries.id})::int`,
      total: sql<number>`coalesce(sum(${deliveries.total}), 0)::int`,
    })
    .from(suppliers)
    .leftJoin(deliveries, eq(deliveries.supplierId, suppliers.id))
    .groupBy(suppliers.id)
    .orderBy(asc(suppliers.name));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.suppliers.title} />
      <SupplierForm />
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t.common.empty}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t.common.name}</th>
                <th>{t.common.phone}</th>
                <th>{t.suppliers.deliveriesCount}</th>
                <th>{t.suppliers.totalPurchased}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, count, total }) => (
                <tr key={s.id}>
                  <td className="font-semibold">{s.name}</td>
                  <td className="num">{s.phone}</td>
                  <td className="num">{count}</td>
                  <td className="num">{formatMoney(total, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
