"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { removeCountLine, saveCountLine } from "@/actions/stock-counts";
import { productName, useI18n } from "@/i18n/client";
import { formatQty, roundQty } from "@/lib/format";

type Product = { id: number; nameFr: string; nameAr: string; barcode: string | null; unit: "PIECE" | "KG" };
type Line = { counted: number; expected?: number };
type Filter = "todo" | "done" | "all";

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function ConfirmButton({ message, className, children }: { message: string; className: string; children: React.ReactNode }) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

export function CountSheet({
  countId,
  products,
  initial,
  showExpected,
}: {
  countId: number;
  products: Product[];
  initial: Record<number, Line>;
  showExpected: boolean;
}) {
  const { t, locale } = useI18n();
  const s = t.stockCounts;
  const [lines, setLines] = useState<Record<number, Line>>(initial);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("todo");
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState("");
  const [flash, setFlash] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(timer);
  }, [flash]);
  useEffect(() => {
    if (selected) qtyRef.current?.focus();
  }, [selected]);

  const countedCount = products.filter((p) => lines[p.id]).length;
  const visible = useMemo(() => {
    const q = normalize(search.trim());
    return products.filter((p) => {
      if (q) return normalize(p.nameFr).includes(q) || normalize(p.nameAr).includes(q) || (p.barcode ?? "").startsWith(q);
      if (filter === "todo") return !lines[p.id];
      if (filter === "done") return !!lines[p.id];
      return true;
    });
  }, [products, search, filter, lines]);

  const pick = (p: Product) => {
    setSelected(p);
    setQty("");
    setSearch("");
  };

  const close = () => {
    setSelected(null);
    setQty("");
    searchRef.current?.focus();
  };

  const onSearchEnter = () => {
    const q = search.trim();
    if (!q) return;
    const exact = products.find((p) => p.barcode === q);
    if (exact) return pick(exact);
    if (visible.length === 1) return pick(visible[0]);
    if (visible.length === 0) {
      setFlash({ text: `${s.notFound} : ${q}`, error: true });
      setSearch("");
    }
  };

  const save = () => {
    if (!selected) return;
    const value = parseFloat(qty.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      setFlash({ text: t.errors.amount, error: true });
      return;
    }
    const product = selected;
    start(async () => {
      const res = await saveCountLine(countId, product.id, value);
      if ("error" in res) {
        setFlash({ text: (t.errors as Record<string, string>)[res.error ?? ""] ?? t.errors.generic, error: true });
        return;
      }
      setLines((l) => ({ ...l, [product.id]: { counted: res.counted, expected: res.expected } }));
      setFlash({ text: `✓ ${productName(product, locale)} : ${formatQty(res.counted, product.unit)}` });
      close();
    });
  };

  const undo = () => {
    if (!selected) return;
    const product = selected;
    start(async () => {
      const res = await removeCountLine(countId, product.id);
      if ("error" in res) {
        setFlash({ text: (t.errors as Record<string, string>)[res.error ?? ""] ?? t.errors.generic, error: true });
        return;
      }
      setLines((l) => {
        const next = { ...l };
        delete next[product.id];
        return next;
      });
      close();
    });
  };

  const current = selected ? lines[selected.id] : undefined;
  const diff = (l?: Line) => (l && l.expected !== undefined ? roundQty(l.counted - l.expected) : undefined);

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">{s.progress}</span>
          <span className="num">
            {countedCount} / {products.length}
          </span>
        </div>
        <div className="h-2 rounded-full bg-surface">
          <div className="h-2 rounded-full bg-brand-500" style={{ width: `${products.length ? (countedCount / products.length) * 100 : 0}%` }} />
        </div>

        {selected ? (
          <div className="space-y-3 rounded-lg border border-brand-300 bg-brand-50 p-3">
            <div className="font-bold">{productName(selected, locale)}</div>
            {current && (
              <div className="text-sm text-muted">
                {s.alreadyCounted}: <span className="num font-semibold text-ink">{formatQty(current.counted, selected.unit)}</span>
                {showExpected && current.expected !== undefined && (
                  <>
                    {" "}
                    · {s.expected}: <span className="num">{formatQty(current.expected, selected.unit)}</span>
                  </>
                )}
              </div>
            )}
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <input
                ref={qtyRef}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && close()}
                inputMode="decimal"
                className="num input max-w-40 text-lg"
                placeholder={`${s.onShelf}${selected.unit === "KG" ? " (kg)" : ""}`}
                required
              />
              <button className="btn-primary" disabled={pending}>{t.common.save}</button>
              <button type="button" className="btn-secondary" onClick={close}>{t.common.cancel}</button>
              {current && (
                <button type="button" className="btn-secondary text-red-700" onClick={undo} disabled={pending}>{s.undo}</button>
              )}
            </form>
          </div>
        ) : (
          <input
            ref={searchRef}
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearchEnter();
              }
            }}
            className="input text-base"
            placeholder={s.scan}
          />
        )}
        {flash && <p className={`text-sm ${flash.error ? "text-red-600" : "text-brand-700"}`}>{flash.text}</p>}
      </div>

      <div className="card overflow-hidden">
        <div className="flex border-b border-line text-sm">
          {(["todo", "done", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`flex-1 border-b-2 px-3 py-2 font-semibold ${filter === f && !search ? "border-brand-600 text-brand-700" : "border-transparent text-muted"}`}
            >
              {f === "todo" ? s.toCount : f === "done" ? s.counted : s.all}{" "}
              <span className="num">({f === "todo" ? products.length - countedCount : f === "done" ? countedCount : products.length})</span>
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted">{t.common.empty}</p>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto text-sm">
            {visible.map((p) => {
              const l = lines[p.id];
              const d = diff(l);
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => pick(p)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start hover:bg-surface">
                    <span>{productName(p, locale)}</span>
                    <span className="num shrink-0">
                      {l ? (
                        <>
                          <span className="font-semibold">{formatQty(l.counted, p.unit)}</span>
                          {showExpected && d !== undefined && d !== 0 && (
                            <span className={`ms-2 text-xs font-semibold ${d < 0 ? "text-red-600" : "text-amber-700"}`}>
                              ({d > 0 ? "+" : ""}
                              {formatQty(d, p.unit)})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
