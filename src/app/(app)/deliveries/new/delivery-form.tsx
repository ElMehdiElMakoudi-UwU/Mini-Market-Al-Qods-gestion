"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createDelivery } from "@/actions/deliveries";
import { productName, useI18n } from "@/i18n/client";
import { centsToInput, formatMoney, toCents } from "@/lib/format";
import { FormError } from "@/components/form-error";

type P = { id: number; nameFr: string; nameAr: string; barcode: string | null; unit: "PIECE" | "KG"; costPrice: number };
type Line = { productId: number; quantity: string; unitCost: string };
type Draft = { supplierId: string; reference: string; note: string; lines: Line[] };

// The draft survives a detour to create a missing product.
const DRAFT_KEY = "delivery:draft";
const emptyDraft: Draft = { supplierId: "", reference: "", note: "", lines: [] };

function loadDraft(): Draft {
  try {
    return { ...emptyDraft, ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") };
  } catch {
    return emptyDraft;
  }
}

export function DeliveryForm({ products, suppliers }: { products: P[]; suppliers: { id: number; name: string }[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [missing, setMissing] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const searchParams = useSearchParams();
  const addedId = Number(searchParams.get("added")) || null;

  useEffect(() => {
    const restored = loadDraft();
    // Returning from "create product": add the new product to the delivery.
    const added = addedId ? byId.get(addedId) : undefined;
    if (added && !restored.lines.some((l) => l.productId === added.id)) {
      restored.lines = [...restored.lines, { productId: added.id, quantity: "1", unitCost: centsToInput(added.costPrice) }];
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore draft from localStorage after mount
    setDraft(restored);
    setLoaded(true);
    if (addedId) router.replace("/deliveries/new");
  }, [addedId, byId, router]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft, loaded]);

  const q = search.trim().toLowerCase();
  const matches = q
    ? products
        .filter((p) => p.nameFr.toLowerCase().includes(q) || p.nameAr.includes(q) || (p.barcode ?? "").startsWith(q))
        .slice(0, 8)
    : [];

  const add = (p: P) => {
    setDraft((d) => {
      const i = d.lines.findIndex((l) => l.productId === p.id);
      if (i >= 0) {
        const lines = [...d.lines];
        lines[i] = { ...lines[i], quantity: String((parseFloat(lines[i].quantity) || 0) + 1) };
        return { ...d, lines };
      }
      return { ...d, lines: [...d.lines, { productId: p.id, quantity: "1", unitCost: centsToInput(p.costPrice) }] };
    });
    setSearch("");
    setMissing(null);
    searchRef.current?.focus();
  };

  const onEnter = () => {
    if (!q) return;
    const exact = products.find((p) => p.barcode === search.trim());
    if (exact) return add(exact);
    if (matches.length === 1) return add(matches[0]);
    if (matches.length === 0) setMissing(search.trim());
  };

  const updateLine = (i: number, patch: Partial<Line>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const total = draft.lines.reduce((s, l) => s + Math.round((toCents(l.unitCost) || 0) * (parseFloat(l.quantity) || 0)), 0);

  const submit = async () => {
    const items = draft.lines
      .filter((l) => byId.has(l.productId))
      .map((l) => ({ productId: l.productId, quantity: parseFloat(l.quantity.replace(",", ".")), unitCost: toCents(l.unitCost || "0") }));
    if (items.length === 0 || items.some((i) => !(i.quantity > 0) || !Number.isFinite(i.unitCost))) {
      setError(items.length === 0 ? "emptyItems" : "amount");
      return;
    }
    setSaving(true);
    const res = await createDelivery({
      supplierId: Number(draft.supplierId) || null,
      reference: draft.reference,
      note: draft.note,
      items,
    });
    if (res.error || !res.id) {
      setError(res.error ?? "generic");
      setSaving(false);
      return;
    }
    localStorage.removeItem(DRAFT_KEY);
    router.push(`/deliveries/${res.id}`);
  };

  return (
    <div className="space-y-4">
      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="label">{t.deliveries.supplier}</label>
          <select className="input" value={draft.supplierId} onChange={(e) => setDraft({ ...draft, supplierId: e.target.value })}>
            <option value="">{t.deliveries.noSupplier}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <Link href="/suppliers" className="mt-1 inline-block text-xs text-brand-700 hover:underline">+ {t.suppliers.new}</Link>
        </div>
        <div>
          <label className="label">{t.deliveries.reference}</label>
          <input className="input" value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} />
        </div>
      </div>

      <div className="card p-5">
        <div className="relative">
          <input
            ref={searchRef}
            className="input py-3"
            placeholder={t.deliveries.addProduct}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setMissing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEnter();
              }
            }}
            autoFocus
          />
          {matches.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
              {matches.map((p) => (
                <li key={p.id}>
                  <button type="button" className="flex w-full justify-between px-3 py-2 text-start text-sm hover:bg-surface" onClick={() => add(p)}>
                    <span>{productName(p, locale)}</span>
                    <span className="num text-muted">{p.barcode}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {missing && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm">
            <span>
              {t.deliveries.notFound} <span className="num font-semibold">{missing}</span>
            </span>
            <Link
              className="btn-primary px-3 py-1"
              href={`/products/new?returnTo=/deliveries/new${/^\d+$/.test(missing) ? `&barcode=${encodeURIComponent(missing)}` : ""}`}
            >
              {t.deliveries.createProduct}
            </Link>
          </div>
        )}

        {draft.lines.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.common.name}</th>
                  <th>{t.common.quantity}</th>
                  <th>{t.deliveries.unitCost}</th>
                  <th>{t.deliveries.lineTotal}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((l, i) => {
                  const p = byId.get(l.productId);
                  if (!p) return null;
                  return (
                    <tr key={l.productId}>
                      <td className="font-medium">{productName(p, locale)}</td>
                      <td>
                        <input
                          className="num input w-24"
                          inputMode="decimal"
                          value={l.quantity}
                          onChange={(e) => updateLine(i, { quantity: e.target.value })}
                        />
                        {p.unit === "KG" && <span className="ms-1 text-xs text-muted">kg</span>}
                      </td>
                      <td>
                        <input
                          className="num input w-28"
                          inputMode="decimal"
                          value={l.unitCost}
                          onChange={(e) => updateLine(i, { unitCost: e.target.value })}
                        />
                      </td>
                      <td className="num whitespace-nowrap font-semibold">
                        {formatMoney(Math.round((toCents(l.unitCost) || 0) * (parseFloat(l.quantity) || 0)), locale)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="text-muted hover:text-red-600"
                          onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card flex flex-wrap items-center gap-4 p-5">
        <textarea
          className="input min-w-60 flex-1"
          rows={2}
          placeholder={t.common.note}
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        />
        <div className="text-end">
          <div className="text-sm text-muted">{t.common.total}</div>
          <div className="num text-2xl font-bold">{formatMoney(total, locale)}</div>
        </div>
        <FormError error={error} />
        <div className="flex w-full gap-2">
          <button className="btn-primary px-6 py-3" onClick={submit} disabled={saving || draft.lines.length === 0}>
            {t.deliveries.submit}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setDraft(emptyDraft);
              setError(undefined);
            }}
          >
            {t.pos.clear}
          </button>
        </div>
      </div>
    </div>
  );
}
