"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { productName, useI18n } from "@/i18n/client";
import { formatDateTime, formatMoney, formatQty, roundQty, toCents } from "@/lib/format";
import {
  cachedBootstrap,
  enqueueSale,
  fetchBootstrap,
  pendingSales,
  syncSales,
  UnauthorizedError,
  type Bootstrap,
  type PosProduct,
} from "@/lib/pos-store";
import { Modal, NumpadModal } from "@/components/numpad-modal";
import { LanguageSwitch } from "@/components/language-switch";

type Line = { product: PosProduct; quantity: number };

type Receipt = {
  id: string;
  number?: number;
  createdAt: string;
  lines: { name: string; quantity: number; unit: "PIECE" | "KG"; unitPrice: number; total: number }[];
  total: number;
  paid: number;
  change: number;
};

const SYNC_INTERVAL_MS = 10_000;
const REFRESH_INTERVAL_MS = 60_000;

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function readAutoPrint() {
  try {
    return localStorage.getItem("pos:autoPrint") !== "0";
  } catch {
    return true;
  }
}

export function PosApp() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [cart, setCart] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"quick" | "all" | number>("quick");
  const [flash, setFlash] = useState<string | null>(null);
  const [weighing, setWeighing] = useState<{ product: PosProduct; lineIndex?: number } | null>(null);
  const [editingQty, setEditingQty] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [autoPrint, setAutoPrint] = useState(readAutoPrint);
  const searchRef = useRef<HTMLInputElement>(null);

  // Deferred so it runs after re-render; never steals focus from an open dialog.
  const focusSearch = () =>
    setTimeout(() => {
      if (!document.querySelector("[data-modal-open]")) searchRef.current?.focus();
    }, 0);

  const refreshPending = useCallback(async () => setPending((await pendingSales()).length), []);

  const loadData = useCallback(async () => {
    try {
      setData(await fetchBootstrap());
      setOnline(true);
      setLoadError(false);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        window.location.href = "/login";
        return;
      }
      setOnline(false);
      const cached = await cachedBootstrap();
      if (cached) setData((d) => d ?? cached);
      else setLoadError(true);
    }
  }, []);

  const trySync = useCallback(
    async (timeoutMs?: number) => {
      try {
        const accepted = await syncSales(timeoutMs);
        setOnline(true);
        // Refresh stock figures once queued sales have been applied on the server.
        if (Object.keys(accepted).length > 0) fetchBootstrap().then(setData, () => {});
        return accepted;
      } catch (e) {
        if (e instanceof UnauthorizedError) window.location.href = "/login";
        else setOnline(false);
        return {};
      } finally {
        refreshPending();
      }
    },
    [refreshPending],
  );

  // Initial load, periodic sync of queued sales and catalog refresh.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    loadData();
    refreshPending();
    trySync();
    const sync = setInterval(() => {
      pendingSales().then((q) => {
        if (q.length > 0) trySync();
      });
    }, SYNC_INTERVAL_MS);
    const refresh = setInterval(loadData, REFRESH_INTERVAL_MS);
    const onOnline = () => {
      trySync();
      loadData();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clearInterval(sync);
      clearInterval(refresh);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [loadData, refreshPending, trySync]);

  // Barcode scanners type like a keyboard: send stray keystrokes to the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (document.querySelector("[data-modal-open]")) return;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(timer);
  }, [flash]);

  const products = useMemo(() => data?.products ?? [], [data]);
  const hasQuick = products.some((p) => p.quickKey);
  const activeCategory = category === "quick" && !hasQuick ? "all" : category;

  const visible = useMemo(() => {
    const q = normalize(search.trim());
    return products.filter((p) => {
      if (q) {
        return (
          normalize(p.nameFr).includes(q) || normalize(p.nameAr).includes(q) || (p.barcode ?? "").startsWith(q)
        );
      }
      if (activeCategory === "quick") return p.quickKey;
      if (activeCategory === "all") return true;
      return p.categoryId === activeCategory;
    });
  }, [products, search, activeCategory]);

  const total = cart.reduce((s, l) => s + Math.round(l.product.salePrice * l.quantity), 0);
  const itemCount = cart.reduce((s, l) => s + (l.product.unit === "KG" ? 1 : l.quantity), 0);

  const addToCart = (product: PosProduct, quantity = 1) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === product.id);
      if (i === -1) return [...c, { product, quantity: roundQty(quantity) }];
      const next = [...c];
      next[i] = { ...next[i], quantity: roundQty(next[i].quantity + quantity) };
      return next;
    });
  };

  const pick = (product: PosProduct) => {
    if (product.unit === "KG") setWeighing({ product });
    else {
      addToCart(product);
      focusSearch();
    }
    setSearch("");
  };

  const onSearchEnter = () => {
    const q = search.trim();
    if (!q) {
      if (cart.length > 0) setPaying(true);
      return;
    }
    const exact = products.find((p) => p.barcode === q);
    if (exact) return pick(exact);
    if (visible.length === 1) return pick(visible[0]);
    setFlash(`${t.pos.notFound} : ${q}`);
    setSearch("");
  };

  const setQty = (index: number, quantity: number) => {
    setCart((c) => (quantity <= 0 ? c.filter((_, i) => i !== index) : c.map((l, i) => (i === index ? { ...l, quantity: roundQty(quantity) } : l))));
  };

  const print = (r: Receipt) => {
    setReceipt(r);
    setTimeout(() => window.print(), 50);
  };

  const completeSale = async (paid: number) => {
    if (!data?.cashSession || cart.length === 0) return;
    const sale = {
      id: crypto.randomUUID(),
      cashSessionId: data.cashSession.id,
      createdAt: new Date().toISOString(),
      paid,
      items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity, unitPrice: l.product.salePrice })),
    };
    await enqueueSale(sale);
    const r: Receipt = {
      id: sale.id,
      createdAt: sale.createdAt,
      lines: cart.map((l) => ({
        name: productName(l.product, locale),
        quantity: l.quantity,
        unit: l.product.unit,
        unitPrice: l.product.salePrice,
        total: Math.round(l.product.salePrice * l.quantity),
      })),
      total,
      paid,
      change: paid - total,
    };
    // Update displayed stock locally until the next catalog refresh.
    setData((d) =>
      d && {
        ...d,
        products: d.products.map((p) => {
          const l = cart.find((x) => x.product.id === p.id);
          return l ? { ...p, stock: roundQty(p.stock - l.quantity) } : p;
        }),
      },
    );
    setCart([]);
    setPaying(false);
    setReceipt(r);
    refreshPending();
    // Give the server a moment to assign the ticket number before printing.
    const accepted = await trySync(2500);
    const withNumber = accepted[sale.id] ? { ...r, number: accepted[sale.id] } : r;
    setReceipt(withNumber);
    if (autoPrint) print(withNumber);
    focusSearch();
  };

  if (!data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        {loadError ? (
          <>
            <p>{t.pos.loadError}</p>
            <button className="btn-primary" onClick={loadData}>{t.pos.retry}</button>
          </>
        ) : (
          <p className="text-muted">…</p>
        )}
      </div>
    );
  }

  const modalOpen = weighing !== null || editingQty !== null || paying;

  return (
    <div className="flex h-screen flex-col" {...(modalOpen ? { "data-modal-open": "" } : {})}>
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 bg-brand-900 px-3 py-2 text-white">
        <span className="font-bold">{t.shopName}</span>
        <span className={`badge ${online ? "bg-brand-500" : "bg-red-600"}`}>{online ? t.pos.online : t.pos.offline}</span>
        {pending > 0 ? (
          <span className="badge bg-amber-400 text-amber-950">
            <span className="num me-1">{pending}</span> {t.pos.pending}
          </span>
        ) : (
          <span className="text-xs text-brand-100/70">{t.pos.synced}</span>
        )}
        <div className="ms-auto flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={(e) => {
                setAutoPrint(e.target.checked);
                try {
                  localStorage.setItem("pos:autoPrint", e.target.checked ? "1" : "0");
                } catch {}
              }}
            />
            {t.pos.autoPrint}
          </label>
          <span className="text-sm text-brand-100/80">{data.user.name}</span>
          <LanguageSwitch className="border-white/20 bg-transparent px-2 py-1 text-white hover:bg-white/10" />
          <Link href={data.user.role === "OWNER" ? "/dashboard" : "/cash"} className="btn border border-white/20 px-3 py-1 text-white hover:bg-white/10">
            ☰
          </Link>
        </div>
      </header>

      {!data.cashSession ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-lg">{t.pos.cashClosed}</p>
          <Link href="/cash" className="btn-primary px-6 py-3 text-base">{t.pos.openCash}</Link>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_380px] lg:grid-cols-[1fr_420px]">
          {/* Products */}
          <section className="flex min-h-0 flex-col border-line md:border-e">
            <div className="space-y-2 bg-white p-3">
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSearchEnter()}
                placeholder={t.pos.scanHint}
                className="input py-3 text-base"
                autoFocus
              />
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {hasQuick && (
                  <CategoryTab active={activeCategory === "quick"} onClick={() => setCategory("quick")}>★ {t.pos.quick}</CategoryTab>
                )}
                <CategoryTab active={activeCategory === "all"} onClick={() => setCategory("all")}>{t.pos.allCategories}</CategoryTab>
                {data.categories.map((c) => (
                  <CategoryTab key={c.id} active={activeCategory === c.id} onClick={() => setCategory(c.id)}>
                    {productName(c, locale)}
                  </CategoryTab>
                ))}
              </div>
              {flash && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{flash}</div>}
            </div>
            <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visible.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pick(p)}
                  className="card flex min-h-24 flex-col justify-between p-3 text-start transition-colors hover:border-brand-500 active:bg-brand-50"
                >
                  <span className="line-clamp-2 text-sm font-semibold leading-snug">{productName(p, locale)}</span>
                  <span className="mt-2 flex items-end justify-between gap-1">
                    <span className="num font-bold text-brand-700">
                      {formatMoney(p.salePrice, locale)}
                      {p.unit === "KG" && <span className="text-xs font-normal">/kg</span>}
                    </span>
                    <span className={`num text-xs ${p.stock <= 0 ? "text-red-600" : "text-muted"}`}>{formatQty(p.stock, p.unit)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Cart */}
          <section className="flex min-h-0 flex-col bg-white">
            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted">{t.pos.cartEmpty}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {cart.map((l, i) => (
                    <li key={l.product.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{productName(l.product, locale)}</div>
                        <div className="num text-xs text-muted">
                          {formatMoney(l.product.salePrice, locale)}
                          {l.product.unit === "KG" && "/kg"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1" dir="ltr">
                        {l.product.unit === "PIECE" && (
                          <button className="h-9 w-9 rounded-lg border border-line text-lg" onClick={() => setQty(i, l.quantity - 1)}>−</button>
                        )}
                        <button
                          className="num h-9 min-w-12 rounded-lg bg-surface px-2 text-sm font-semibold"
                          onClick={() => (l.product.unit === "KG" ? setWeighing({ product: l.product, lineIndex: i }) : setEditingQty(i))}
                        >
                          {formatQty(l.quantity, l.product.unit)}
                        </button>
                        {l.product.unit === "PIECE" && (
                          <button className="h-9 w-9 rounded-lg border border-line text-lg" onClick={() => setQty(i, l.quantity + 1)}>+</button>
                        )}
                      </div>
                      <div className="num w-20 text-end text-sm font-bold">{formatMoney(Math.round(l.product.salePrice * l.quantity), locale)}</div>
                      <button className="px-1 text-muted hover:text-red-600" onClick={() => setQty(i, 0)} aria-label={t.common.delete}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {receipt && cart.length === 0 && (
              <div className="flex items-center justify-between gap-2 border-t border-line bg-brand-50 px-3 py-2 text-sm">
                <span>
                  ✓ {t.pos.saleDone} — <span className="num font-semibold">{formatMoney(receipt.total, locale)}</span>
                  {receipt.change > 0 && (
                    <> · {t.pos.change}: <span className="num font-bold">{formatMoney(receipt.change, locale)}</span></>
                  )}
                </span>
                <button className="btn-secondary px-3 py-1" onClick={() => print(receipt)}>{t.common.print}</button>
              </div>
            )}

            <div className="space-y-2 border-t border-line p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted">
                  <span className="num">{itemCount}</span> {t.pos.items}
                </span>
                <span className="num text-3xl font-bold">{formatMoney(total, locale)}</span>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <button className="btn-secondary py-4" onClick={() => setCart([])} disabled={cart.length === 0}>{t.pos.clear}</button>
                <button className="btn-primary py-4 text-lg" onClick={() => setPaying(true)} disabled={cart.length === 0}>{t.pos.checkout}</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {weighing && (
        <WeightModal
          product={weighing.product}
          initial={weighing.lineIndex !== undefined ? cart[weighing.lineIndex]?.quantity : undefined}
          onClose={() => {
            setWeighing(null);
            focusSearch();
          }}
          onConfirm={(kg) => {
            if (weighing.lineIndex !== undefined) setQty(weighing.lineIndex, kg);
            else addToCart(weighing.product, kg);
            setWeighing(null);
            focusSearch();
          }}
        />
      )}

      {editingQty !== null && cart[editingQty] && (
        <NumpadModal
          title={`${t.pos.enterQty} — ${productName(cart[editingQty].product, locale)}`}
          initial={String(cart[editingQty].quantity)}
          onClose={() => {
            setEditingQty(null);
            focusSearch();
          }}
          onConfirm={(v) => {
            setQty(editingQty, Math.round(parseFloat(v)));
            setEditingQty(null);
            focusSearch();
          }}
        />
      )}

      {paying && (
        <PaymentModal
          total={total}
          onClose={() => {
            setPaying(false);
            focusSearch();
          }}
          onConfirm={completeSale}
        />
      )}

      {receipt && <ReceiptView receipt={receipt} />}
    </div>
  );
}

function CategoryTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${active ? "bg-brand-600 text-white" : "bg-surface text-ink hover:bg-brand-50"}`}
    >
      {children}
    </button>
  );
}

function WeightModal({
  product,
  initial,
  onConfirm,
  onClose,
}: {
  product: PosProduct;
  initial?: number;
  onConfirm: (kg: number) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [byAmount, setByAmount] = useState(false);
  return (
    <NumpadModal
      key={byAmount ? "amount" : "weight"}
      title={productName(product, locale)}
      initial={byAmount || initial === undefined ? "" : String(initial)}
      suffix={byAmount ? "DH" : "kg"}
      onClose={onClose}
      onConfirm={(v) => {
        const n = parseFloat(v);
        onConfirm(roundQty(byAmount ? toCents(n) / product.salePrice : n));
      }}
      hint={
        <span className="num text-muted">
          {formatMoney(product.salePrice, locale)}/kg
        </span>
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-surface p-1 text-sm">
        <button className={`rounded-md py-2 font-medium ${!byAmount ? "bg-white shadow-sm" : ""}`} onClick={() => setByAmount(false)}>
          {t.pos.byWeight}
        </button>
        <button className={`rounded-md py-2 font-medium ${byAmount ? "bg-white shadow-sm" : ""}`} onClick={() => setByAmount(true)}>
          {t.pos.byAmount}
        </button>
      </div>
    </NumpadModal>
  );
}

function PaymentModal({ total, onConfirm, onClose }: { total: number; onConfirm: (paid: number) => void; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [received, setReceived] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const paid = received.trim() === "" ? total : toCents(received);
  const change = paid - total;
  const valid = Number.isFinite(paid) && paid >= total;
  const bills = [1000, 2000, 5000, 10000, 20000].filter((b) => b > total).slice(0, 3);

  useEffect(() => inputRef.current?.focus(), []);

  const submit = async (amount = paid) => {
    if (busy || !Number.isFinite(amount) || amount < total) return;
    setBusy(true);
    await onConfirm(amount);
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-4 text-lg font-bold">{t.pos.payment}</h2>
      <div className="mb-4 flex items-baseline justify-between rounded-lg bg-surface p-3">
        <span className="text-muted">{t.pos.toPay}</span>
        <span className="num text-3xl font-bold">{formatMoney(total, locale)}</span>
      </div>
      <label className="label">{t.pos.received}</label>
      <input
        ref={inputRef}
        value={received}
        inputMode="decimal"
        placeholder={(total / 100).toFixed(2)}
        onChange={(e) => setReceived(e.target.value.replace(/[^0-9.,]/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className="num input py-3 text-end text-2xl font-bold"
      />
      <div className="mt-2 grid grid-cols-4 gap-2">
        <button className="btn-secondary px-2" onClick={() => submit(total)}>{t.pos.exact}</button>
        {bills.map((b) => (
          <button key={b} className="num btn-secondary px-2" onClick={() => submit(b)}>
            {b / 100}
          </button>
        ))}
      </div>
      <div className={`mt-4 flex items-baseline justify-between rounded-lg p-3 ${valid ? "bg-brand-50" : "bg-red-50"}`}>
        <span className="font-medium">{valid ? t.pos.change : t.pos.insufficient}</span>
        <span className="num text-3xl font-bold">{valid ? formatMoney(change, locale) : ""}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="btn-secondary py-3" onClick={onClose}>{t.common.cancel}</button>
        <button className="btn-primary py-3" disabled={!valid || busy} onClick={() => submit()}>{t.pos.validate}</button>
      </div>
    </Modal>
  );
}

function ReceiptView({ receipt }: { receipt: Receipt }) {
  const { t, locale } = useI18n();
  return (
    <div id="receipt">
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 15 }}>{t.shopName}</div>
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <span className="num">{formatDateTime(receipt.createdAt, locale)}</span>
        <br />
        {t.pos.receiptNo} <span className="num">{receipt.number ?? receipt.id.slice(0, 8).toUpperCase()}</span>
      </div>
      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
      {receipt.lines.map((l, i) => (
        <div key={i} style={{ marginBottom: 3 }}>
          <div>{l.name}</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="num">
              {formatQty(l.quantity, l.unit)} × {(l.unitPrice / 100).toFixed(2)}
            </span>
            <span className="num">{(l.total / 100).toFixed(2)}</span>
          </div>
        </div>
      ))}
      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}>
        <span>{t.common.total}</span>
        <span className="num">{formatMoney(receipt.total, locale)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{t.pos.received}</span>
        <span className="num">{formatMoney(receipt.paid, locale)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{t.pos.change}</span>
        <span className="num">{formatMoney(receipt.change, locale)}</span>
      </div>
      <div style={{ textAlign: "center", marginTop: 8 }}>{t.pos.thanks}</div>
    </div>
  );
}
