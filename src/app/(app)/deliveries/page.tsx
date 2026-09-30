import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deliveries, deliveryItems, suppliers, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/i18n/server";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export default async function DeliveriesPage() {
  await requireUser();
  const { t, locale } = await getDict();
  const rows = await db
    .select({
      d: deliveries,
      supplier: suppliers.name,
      userName: users.name,
      items: sql<number>`(select count(*)::int from ${deliveryItems} where ${deliveryItems.deliveryId} = ${deliveries.id})`,
    })
    .from(deliveries)
    .leftJoin(suppliers, eq(suppliers.id, deliveries.supplierId))
    .innerJoin(users, eq(users.id, deliveries.userId))
    .orderBy(desc(deliveries.createdAt))
    .limit(100);
  return (
    <div className="space-y-6">
      <PageHeader title={t.deliveries.title}>
        <Link href="/deliveries/new" className="btn-primary">+ {t.deliveries.new}</Link>
      </PageHeader>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t.common.empty}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t.common.date}</th>
                <th>{t.deliveries.supplier}</th>
                <th>{t.deliveries.reference}</th>
                <th>{t.deliveries.itemsCount}</th>
                <th>{t.common.total}</th>
                <th>{t.common.user}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ d, supplier, userName, items }) => (
                <tr key={d.id} className="hover:bg-surface">
                  <td className="num whitespace-nowrap">
                    <Link href={`/deliveries/${d.id}`} className="font-semibold text-brand-700 hover:underline">
                      {formatDateTime(d.createdAt, locale)}
                    </Link>
                  </td>
                  <td>{supplier ?? "—"}</td>
                  <td>{d.reference}</td>
                  <td className="num">{items}</td>
                  <td className="num font-semibold">{formatMoney(d.total, locale)}</td>
                  <td>{userName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
