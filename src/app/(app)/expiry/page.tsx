import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { expiringBatches, SOON_DAYS, type Batch } from "@/lib/expiry";
import { getDict } from "@/i18n/server";
import { formatDateTime, formatQty } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ClearBatchButton, DaysLeft } from "@/components/expiry";

export default async function ExpiryPage() {
  await requireUser();
  const { t, locale } = await getDict();
  const batches = await expiringBatches();
  const groups = [
    { title: t.expiry.expiredTitle, items: batches.filter((b) => b.daysLeft < 0), tone: "text-red-700" },
    { title: t.expiry.soonTitle, items: batches.filter((b) => b.daysLeft >= 0 && b.daysLeft <= SOON_DAYS), tone: "text-amber-800" },
    { title: t.expiry.laterTitle, items: batches.filter((b) => b.daysLeft > SOON_DAYS), tone: "" },
  ].filter((g) => g.items.length > 0);

  const name = (b: Batch) => (locale === "ar" && b.product.nameAr ? b.product.nameAr : b.product.nameFr);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t.expiry.title} />
      <p className="text-sm text-muted">{t.expiry.help}</p>

      {groups.length === 0 && <div className="card p-5 text-sm text-muted">{t.expiry.none}</div>}

      {groups.map((g) => (
        <div key={g.title} className="card overflow-x-auto">
          <h2 className={`p-5 pb-2 font-bold ${g.tone}`}>
            {g.title} <span className="num text-muted">({g.items.length})</span>
          </h2>
          <table className="table">
            <thead>
              <tr>
                <th>{t.losses.product}</th>
                <th>{t.expiry.expiryDate}</th>
                <th>{t.expiry.remaining}</th>
                <th>{t.expiry.received}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {g.items.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/products/${b.product.id}`} className="font-semibold text-brand-700 hover:underline">
                      {name(b)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="num me-2">{b.expiryDate.split("-").reverse().join("/")}</span>
                    <DaysLeft days={b.daysLeft} />
                  </td>
                  <td className="num font-semibold">{formatQty(b.remaining, b.product.unit)}</td>
                  <td className="num text-muted">
                    {b.deliveryId ? (
                      <Link href={`/deliveries/${b.deliveryId}`} className="hover:underline">{formatDateTime(b.createdAt, locale)}</Link>
                    ) : (
                      formatDateTime(b.createdAt, locale)
                    )}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-3">
                      {b.daysLeft <= 0 && (
                        <Link
                          href={`/losses?product=${b.product.id}&quantity=${b.remaining}&reason=EXPIRED`}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          {t.expiry.declareLoss}
                        </Link>
                      )}
                      <ClearBatchButton id={b.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
