// Demo data for local testing: `npm run db:seed`. Do not run in production.
import bcrypt from "bcryptjs";
import { db } from "../src/db";
import { categories, products, users } from "../src/db/schema";

const cats = [
  { nameFr: "Épicerie", nameAr: "بقالة" },
  { nameFr: "Boissons", nameAr: "مشروبات" },
  { nameFr: "Produits laitiers", nameAr: "مشتقات الحليب" },
  { nameFr: "Hygiène", nameAr: "نظافة" },
  { nameFr: "Vrac", nameAr: "بالميزان" },
];

async function main() {
  const inserted = await db.insert(categories).values(cats.map((c, i) => ({ ...c, sortOrder: i }))).returning();
  const [epicerie, boissons, laitiers, hygiene, vrac] = inserted.map((c) => c.id);
  await db.insert(products).values([
    { nameFr: "Pain", nameAr: "خبز", categoryId: epicerie, salePrice: 150, costPrice: 120, stock: 40, minStock: 10, quickKey: true },
    { nameFr: "Lait Centrale 1L", nameAr: "حليب سنطرال 1ل", barcode: "6111242100152", categoryId: laitiers, salePrice: 750, costPrice: 680, stock: 24, minStock: 6, quickKey: true },
    { nameFr: "Yaourt Danone", nameAr: "دانون", barcode: "6111242101012", categoryId: laitiers, salePrice: 250, costPrice: 210, stock: 30, minStock: 12 },
    { nameFr: "Coca-Cola 1L", nameAr: "كوكا كولا 1ل", barcode: "5449000000439", categoryId: boissons, salePrice: 1000, costPrice: 850, stock: 18, minStock: 6, quickKey: true },
    { nameFr: "Eau Sidi Ali 1.5L", nameAr: "ماء سيدي علي", barcode: "6111021090019", categoryId: boissons, salePrice: 600, costPrice: 480, stock: 36, minStock: 12, quickKey: true },
    { nameFr: "Thé Sultan 200g", nameAr: "شاي السلطان", barcode: "6111250470155", categoryId: epicerie, salePrice: 1800, costPrice: 1550, stock: 10, minStock: 4 },
    { nameFr: "Sucre en pain 2kg", nameAr: "قالب السكر", categoryId: epicerie, salePrice: 1700, costPrice: 1500, stock: 8, minStock: 4 },
    { nameFr: "Huile Lesieur 1L", nameAr: "زيت لوسيور", barcode: "6111128000019", categoryId: epicerie, salePrice: 2000, costPrice: 1800, stock: 3, minStock: 5 },
    { nameFr: "Farine Mouna 1kg", nameAr: "دقيق مونا", categoryId: epicerie, salePrice: 900, costPrice: 780, stock: 12, minStock: 5 },
    { nameFr: "Savon Tide 1kg", nameAr: "تايد", barcode: "5413149000014", categoryId: hygiene, salePrice: 2500, costPrice: 2150, stock: 6, minStock: 3 },
    { nameFr: "Olives noires", nameAr: "زيتون أسود", categoryId: vrac, unit: "KG", salePrice: 3000, costPrice: 2200, stock: 5.5, minStock: 2, quickKey: true },
    { nameFr: "Tomates", nameAr: "طماطم", categoryId: vrac, unit: "KG", salePrice: 600, costPrice: 400, stock: 12, minStock: 3 },
    { nameFr: "Œufs (unité)", nameAr: "بيض", categoryId: epicerie, salePrice: 130, costPrice: 105, stock: 90, minStock: 30, quickKey: true },
  ] as (typeof products.$inferInsert)[]);
  await db
    .insert(users)
    .values({ name: "Youssef", username: "youssef", role: "MANAGER", passwordHash: await bcrypt.hash("1234", 10) })
    .onConflictDoNothing();
  console.log("Seeded demo data (manager: youssef / 1234)");
  process.exit(0);
}

main();
