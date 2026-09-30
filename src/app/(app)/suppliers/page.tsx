import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { deliveries } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { suppliersWithBalance } from "@/lib/supplier-debt";
import { getDict } from "@/i18n/server";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "./supplier-form";

export default async function SuppliersPage() {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const [rows, purchases] = await Promise.all([
    suppliersWithBalance(),
    db
      .select({
        supplierId: deliveries.supplierId,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(${deliveries.total}), 0)::int`,
      })
      .from(deliveries)
      .groupBy(deliveries.supplierId),
  ]);
  const purchasesBySupplier = new Map(purchases.map((p) => [p.supplierId, p]));
  const owing = rows.filter((s) => s.balance > 0);
  const totalOwed = owing.reduce((s, r) => s + r.balance, 0);
  const sorted = [...rows].sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  const m = (c: number) => formatMoney(c, locale);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t.suppliers.title} />

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="text-sm text-muted">{t.suppliers.totalOwed}</div>
          <div className="num mt-1 text-2xl font-bold text-red-600">{m(totalOwed)}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-muted">{t.suppliers.count}</div>
          <div className="num mt-1 text-2xl font-bold">{owing.length}</div>
        </div>
      </div>

      <div className="card p-4">
        <SupplierForm isOwner={user.role === "OWNER"} />
      </div>

      <div className="card overflow-x-auto">
        {sorted.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t.common.empty}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t.common.name}</th>
                <th>{t.common.phone}</th>
                <th>{t.suppliers.balance}</th>
                <th>{t.suppliers.deliveriesCount}</th>
                <th>{t.suppliers.totalPurchased}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => {
                const p = purchasesBySupplier.get(s.id);
                return (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/suppliers/${s.id}`} className="font-semibold text-brand-700 hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="num">{s.phone}</td>
                    <td className={`num font-bold ${s.balance > 0 ? "text-red-600" : "text-muted"}`}>{m(s.balance)}</td>
                    <td className="num">{p?.count ?? 0}</td>
                    <td className="num">{m(p?.total ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
