import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products, suppliers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getOpenCashSession } from "@/lib/cash";
import { getDict } from "@/i18n/server";
import { PageHeader } from "@/components/page-header";
import { DeliveryForm } from "./delivery-form";

export default async function NewDeliveryPage() {
  const user = await requireUser();
  const { t } = await getDict();
  const [productRows, supplierRows, cashSession] = await Promise.all([
    db
      .select({
        id: products.id,
        nameFr: products.nameFr,
        nameAr: products.nameAr,
        barcode: products.barcode,
        unit: products.unit,
        costPrice: products.costPrice,
      })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.nameFr)),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(asc(suppliers.name)),
    getOpenCashSession(),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t.deliveries.new} />
      <DeliveryForm products={productRows} suppliers={supplierRows} isOwner={user.role === "OWNER"} cashOpen={!!cashSession} />
    </div>
  );
}
