"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveProduct } from "@/actions/products";
import { useI18n, productName } from "@/i18n/client";
import { centsToInput } from "@/lib/format";
import { FormError } from "@/components/form-error";
import type { Category, Product } from "@/db/schema";

export function ProductForm({
  product,
  categories,
  isOwner,
  defaultBarcode,
  returnTo,
}: {
  product?: Product;
  categories: Category[];
  isOwner: boolean;
  defaultBarcode?: string;
  returnTo?: string;
}) {
  const { t, locale } = useI18n();
  const [state, action, pending] = useActionState(saveProduct, undefined);
  const priceLocked = !!product && !isOwner;

  return (
    <form action={action} className="card space-y-4 p-5">
      {product && <input type="hidden" name="id" value={product.id} />}
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

      <div>
        <label className="label">{t.products.barcode}</label>
        <input
          name="barcode"
          className="num input"
          defaultValue={product?.barcode ?? defaultBarcode ?? ""}
          autoFocus={!product}
          // Scanners end with Enter: jump to the next field instead of submitting.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget.form?.elements.namedItem("nameFr") as HTMLInputElement | null)?.focus();
            }
          }}
        />
        <p className="mt-1 text-xs text-muted">{t.products.barcodeHelp}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">{t.products.nameFr} *</label>
          <input name="nameFr" className="input" defaultValue={product?.nameFr} required />
        </div>
        <div>
          <label className="label">{t.products.nameAr}</label>
          <input name="nameAr" className="input" dir="rtl" defaultValue={product?.nameAr} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">{t.products.category}</label>
          <select name="categoryId" className="input" defaultValue={product?.categoryId ?? ""}>
            <option value="">{t.products.noCategory}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{productName(c, locale)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t.products.unit}</label>
          <select name="unit" className="input" defaultValue={product?.unit ?? "PIECE"}>
            <option value="PIECE">{t.units.PIECE}</option>
            <option value="KG">{t.units.KG}</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">{t.products.salePrice} *</label>
          <input
            name="salePrice"
            inputMode="decimal"
            className="num input"
            defaultValue={product ? centsToInput(product.salePrice) : ""}
            required
            disabled={priceLocked}
          />
        </div>
        <div>
          <label className="label">{t.products.costPrice}</label>
          <input
            name="costPrice"
            inputMode="decimal"
            className="num input"
            defaultValue={product ? centsToInput(product.costPrice) : ""}
            disabled={priceLocked}
          />
        </div>
        {priceLocked && <p className="text-xs text-amber-700 sm:col-span-2">{t.products.priceLocked}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {!product && (
          <div>
            <label className="label">{t.products.initialStock}</label>
            <input name="initialStock" inputMode="decimal" className="num input" defaultValue="0" />
          </div>
        )}
        <div>
          <label className="label">{t.products.minStock}</label>
          <input name="minStock" inputMode="decimal" className="num input" defaultValue={product?.minStock ?? 0} />
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="quickKey" defaultChecked={product?.quickKey} /> {t.products.quickKey}
        </label>
        {product && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={product.active} /> {t.common.active}
          </label>
        )}
      </div>

      <FormError error={state?.error} />
      <div className="flex gap-2">
        <button className="btn-primary px-6" disabled={pending}>{t.common.save}</button>
        <Link href={returnTo ?? "/products"} className="btn-secondary">{t.common.cancel}</Link>
      </div>
    </form>
  );
}
