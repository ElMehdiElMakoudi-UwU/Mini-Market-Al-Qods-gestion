import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deliveries, deliveryItems, products, supplierEntries, suppliers, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/i18n/server";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export default async function DeliveryPage({ params }: PageProps<"/deliveries/[id]">) {
  await requireUser();
  const { t, locale } = await getDict();
  const id = Number((await params).id);
  const [row] = Number.isInteger(id)
    ? await db
        .select({ d: deliveries, supplier: suppliers.name, userName: users.name })
        .from(deliveries)
        .leftJoin(suppliers, eq(suppliers.id, deliveries.supplierId))
        .innerJoin(users, eq(users.id, deliveries.userId))
        .where(eq(deliveries.id, id))
    : [];
  if (!row) notFound();
  const items = await db
    .select({ i: deliveryItems, p: products })
    .from(deliveryItems)
    .innerJoin(products, eq(products.id, deliveryItems.productId))
    .where(eq(deliveryItems.deliveryId, id));
  const [payment] = await db
    .select({ paid: sql<number>`coalesce(-sum(${supplierEntries.amount}), 0)::int` })
    .from(supplierEntries)
    .where(and(eq(supplierEntries.deliveryId, id), eq(supplierEntries.type, "PAYMENT")));
  const { d } = row;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.deliveries.details} />
      <div className="card grid gap-3 p-5 text-sm sm:grid-cols-2">
        <div><span className="text-muted">{t.common.date}:</span> <span className="num">{formatDateTime(d.createdAt, locale)}</span></div>
        <div>
          <span className="text-muted">{t.deliveries.supplier}:</span>{" "}
          {d.supplierId ? <Link href={`/suppliers/${d.supplierId}`} className="text-brand-700 hover:underline">{row.supplier}</Link> : "—"}
        </div>
        <div><span className="text-muted">{t.deliveries.reference}:</span> {d.reference || "—"}</div>
        <div><span className="text-muted">{t.common.user}:</span> {row.userName}</div>
        {d.supplierId && (
          <>
            <div><span className="text-muted">{t.deliveries.paidAtDelivery}:</span> <span className="num">{formatMoney(payment.paid, locale)}</span></div>
            <div>
              <span className="text-muted">{t.deliveries.remaining}:</span>{" "}
              <span className={`num font-semibold ${d.total - payment.paid > 0 ? "text-red-600" : ""}`}>{formatMoney(d.total - payment.paid, locale)}</span>
            </div>
          </>
        )}
        {d.note && <div className="sm:col-span-2"><span className="text-muted">{t.common.note}:</span> {d.note}</div>}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{t.common.name}</th>
              <th>{t.common.quantity}</th>
              <th>{t.deliveries.unitCost}</th>
              <th>{t.deliveries.lineTotal}</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ i, p }) => (
              <tr key={i.id}>
                <td>{locale === "ar" && p.nameAr ? p.nameAr : p.nameFr}</td>
                <td className="num">{formatQty(i.quantity, p.unit)}</td>
                <td className="num">{formatMoney(i.unitCost, locale)}</td>
                <td className="num font-semibold">{formatMoney(Math.round(i.unitCost * i.quantity), locale)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="text-end font-bold">{t.common.total}</td>
              <td className="num font-bold">{formatMoney(d.total, locale)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
