"use client";

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    } else {
      // In development a worker left over from a production run serves stale
      // cached pages, which breaks hydration: remove it.
      (async () => {
        const regs = await navigator.serviceWorker.getRegistrations();
        if (regs.length === 0) return;
        await Promise.all(regs.map((r) => r.unregister()));
        await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      })().catch(() => {});
    }
  }, []);
  return null;
}
