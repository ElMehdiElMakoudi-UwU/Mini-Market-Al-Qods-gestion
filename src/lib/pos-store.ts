"use client";

// Offline storage for the POS (IndexedDB via idb-keyval).
// The product catalog is cached so the POS opens without network, and every
// sale is written to a local queue first, then sent to the server.

import { get, set, update } from "idb-keyval";

export type PosProduct = {
  id: number;
  nameFr: string;
  nameAr: string;
  barcode: string | null;
  categoryId: number | null;
  unit: "PIECE" | "KG";
  salePrice: number;
  stock: number;
  quickKey: boolean;
};

export type PosCustomer = { id: number; name: string; phone: string; balance: number; creditLimit: number };

export type PosCategory = { id: number; nameFr: string; nameAr: string };

export type Bootstrap = {
  user: { id: number; name: string; role: "OWNER" | "MANAGER" };
  products: PosProduct[];
  categories: PosCategory[];
  // Missing in catalogs cached before the credit book existed.
  customers?: PosCustomer[];
  cashSession: { id: number; openedAt: string; openedByName: string } | null;
  fetchedAt: string;
};

export type QueuedSale = {
  id: string;
  cashSessionId: number;
  createdAt: string;
  paid: number;
  customerId?: number | null;
  items: { productId: number; quantity: number; unitPrice: number }[];
};

const BOOTSTRAP_KEY = "pos:bootstrap";
const QUEUE_KEY = "pos:queue";

export class UnauthorizedError extends Error {}

export async function fetchBootstrap(): Promise<Bootstrap> {
  const res = await fetch("/api/pos/bootstrap", { cache: "no-store" });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`bootstrap ${res.status}`);
  const data = (await res.json()) as Bootstrap;
  await set(BOOTSTRAP_KEY, data);
  return data;
}

export function cachedBootstrap(): Promise<Bootstrap | undefined> {
  return get(BOOTSTRAP_KEY);
}

export async function enqueueSale(sale: QueuedSale) {
  await update<QueuedSale[]>(QUEUE_KEY, (q) => [...(q ?? []), sale]);
}

export async function pendingSales(): Promise<QueuedSale[]> {
  return (await get<QueuedSale[]>(QUEUE_KEY)) ?? [];
}

let syncing: Promise<Record<string, number>> | null = null;

/**
 * Sends queued sales to the server. Returns the server numbers of the sales
 * that were accepted. Concurrent calls share one in-flight request.
 */
export function syncSales(timeoutMs = 20000): Promise<Record<string, number>> {
  if (syncing) return syncing;
  syncing = (async () => {
    const queue = await pendingSales();
    if (queue.length === 0) return {};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("/api/pos/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales: queue }),
        signal: controller.signal,
      });
      if (res.status === 401) throw new UnauthorizedError();
      if (!res.ok) throw new Error(`sync ${res.status}`);
      const { accepted } = (await res.json()) as { accepted: Record<string, number> };
      await update<QueuedSale[]>(QUEUE_KEY, (q) => (q ?? []).filter((s) => !(s.id in accepted)));
      return accepted;
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}
