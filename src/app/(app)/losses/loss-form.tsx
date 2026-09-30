"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { recordLoss } from "@/actions/losses";
import { productName, useI18n } from "@/i18n/client";
import { formatMoney, formatQty } from "@/lib/format";
import { FormError } from "@/components/form-error";

type P = { id: number; nameFr: string; nameAr: string; barcode: string | null; unit: "PIECE" | "KG"; costPrice: number; stock: number };

const REASONS = ["EXPIRED", "BROKEN", "STOLEN", "DAMAGED", "OTHER"];

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function LossForm({
  products,
  initial,
}: {
  products: P[];
  // Prefilled from the expiry page's "declare as loss" link.
  initial?: { productId?: number; quantity?: string; reason?: string };
}) {
  const { t, locale } = useI18n();
  const [state, action, pending] = useActionState(recordLoss, undefined);
  const [product, setProduct] = useState<P | null>(() => products.find((p) => p.id === initial?.productId) ?? null);
  const [search, setSearch] = useState("");
  const [notFound, setNotFound] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state?.ok) return;
    ref.current?.reset();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ready for the next loss after saving
    setProduct(null);
    searchRef.current?.focus();
  }, [state]);

  const q = normalize(search.trim());
  const matches = q
    ? products.filter((p) => normalize(p.nameFr).includes(q) || normalize(p.nameAr).includes(q) || (p.barcode ?? "").startsWith(q)).slice(0, 8)
    : [];

  const pick = (p: P) => {
    setProduct(p);
    setSearch("");
    setNotFound(false);
  };

  return (
    <form ref={ref} action={action} className="space-y-4">
      {product ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-3">
          <div>
            <div className="font-semibold">{productName(product, locale)}</div>
            <div className="num text-xs text-muted">
              {t.products.stock}: {formatQty(product.stock, product.unit)} · {t.products.costPrice}: {formatMoney(product.costPrice, locale)}
            </div>
          </div>
          <button type="button" className="btn-secondary px-3 py-1" onClick={() => setProduct(null)}>{t.losses.change}</button>
          <input type="hidden" name="productId" value={product.id} />
        </div>
      ) : (
        <div className="relative">
          <label className="label">{t.losses.product} *</label>
          <input
            ref={searchRef}
            className="input py-3"
            placeholder={t.losses.searchProduct}
            value={search}
            autoFocus
            onChange={(e) => {
              setSearch(e.target.value);
              setNotFound(false);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const exact = products.find((p) => p.barcode === search.trim());
              if (exact) pick(exact);
              else if (matches.length === 1) pick(matches[0]);
              else if (q && matches.length === 0) setNotFound(true);
            }}
          />
          {matches.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
              {matches.map((p) => (
                <li key={p.id}>
                  <button type="button" className="flex w-full justify-between px-3 py-2 text-start text-sm hover:bg-surface" onClick={() => pick(p)}>
                    <span>{productName(p, locale)}</span>
                    <span className="num text-muted">{formatQty(p.stock, p.unit)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {notFound && <p className="mt-1 text-sm text-red-600">{t.pos.notFound}</p>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">
            {t.common.quantity} * {product?.unit === "KG" && <span className="text-muted">(kg)</span>}
          </label>
          <input name="quantity" inputMode="decimal" className="num input" defaultValue={initial?.quantity ?? "1"} required />
        </div>
        <div>
          <label className="label">{t.common.note}</label>
          <input name="note" className="input" />
        </div>
      </div>

      <div>
        <label className="label">{t.losses.reason} *</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {REASONS.map((r) => (
            <label
              key={r}
              className="flex items-center gap-2 rounded-lg border border-line p-2 text-sm has-checked:border-red-500 has-checked:bg-red-50"
            >
              <input type="radio" name="reason" value={r} required defaultChecked={initial?.reason === r} /> {t.lossReasons[r]}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-danger" disabled={pending || !product}>{t.losses.submit}</button>
        {state?.ok && <span className="text-sm text-brand-600">✓ {t.common.saved}</span>}
        <FormError error={state?.error} />
      </div>
    </form>
  );
}
