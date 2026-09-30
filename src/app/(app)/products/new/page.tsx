import { asc } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/i18n/server";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "../product-form";

export default async function NewProductPage({ searchParams }: PageProps<"/products/new">) {
  const user = await requireUser();
  const { t } = await getDict();
  const sp = await searchParams;
  const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.nameFr));
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t.products.new} />
      <ProductForm
        categories={cats}
        isOwner={user.role === "OWNER"}
        defaultBarcode={typeof sp.barcode === "string" ? sp.barcode : undefined}
        returnTo={typeof sp.returnTo === "string" && sp.returnTo.startsWith("/") ? sp.returnTo : undefined}
      />
    </div>
  );
}
