import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/i18n/server";
import { PageHeader } from "@/components/page-header";
import { CategoryForm } from "./category-form";

export default async function CategoriesPage() {
  await requireUser();
  const { t } = await getDict();
  const rows = await db
    .select({ c: categories, count: sql<number>`count(${products.id})::int` })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.nameFr));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.products.categories} />
      <CategoryForm />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{t.products.nameFr}</th>
              <th>{t.products.nameAr}</th>
              <th>{t.nav.products}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, count }) => (
              <tr key={c.id}>
                <td>{c.nameFr}</td>
                <td dir="rtl">{c.nameAr}</td>
                <td className="num">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
