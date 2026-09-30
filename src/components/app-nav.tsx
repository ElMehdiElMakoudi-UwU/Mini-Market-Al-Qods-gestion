"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { logout } from "@/actions/auth";
import { LanguageSwitch } from "./language-switch";

type Item = { href: string; label: string; ownerOnly?: boolean };

export function AppNav({ user, roleLabel }: { user: { name: string; role: "OWNER" | "MANAGER" }; roleLabel: string }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items: Item[] = [
    { href: "/dashboard", label: t.nav.dashboard, ownerOnly: true },
    { href: "/reports", label: t.nav.reports, ownerOnly: true },
    { href: "/pos", label: t.nav.pos },
    { href: "/cash", label: t.nav.cash },
    { href: "/customers", label: t.nav.customers },
    { href: "/products", label: t.nav.products },
    { href: "/deliveries", label: t.nav.deliveries },
    { href: "/suppliers", label: t.nav.suppliers },
    { href: "/expenses", label: t.nav.expenses },
    { href: "/losses", label: t.nav.losses },
    { href: "/expiry", label: t.nav.expiry },
    { href: "/stock-counts", label: t.nav.stockCounts },
    { href: "/sales", label: t.nav.sales },
    { href: "/users", label: t.nav.users, ownerOnly: true },
    { href: "/activity", label: t.nav.activity, ownerOnly: true },
    { href: "/alerts", label: t.nav.alerts, ownerOnly: true },
  ].filter((i) => !i.ownerOnly || user.role === "OWNER");

  return (
    <aside className="border-line bg-brand-900 text-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col">
      <div className="flex items-center justify-between px-4 py-3 md:py-5">
        <div>
          <div className="font-bold leading-tight">{t.shopName}</div>
          <div className="text-xs text-brand-100/70">{user.name} · {roleLabel}</div>
        </div>
        <button className="rounded-md border border-white/20 px-3 py-1 text-sm md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          ☰
        </button>
      </div>
      <nav className={`${open ? "block" : "hidden"} flex-1 space-y-0.5 overflow-y-auto px-2 pb-3 md:block`}>
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`block rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-white/15 text-white" : "text-brand-100/80 hover:bg-white/10 hover:text-white"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className={`${open ? "flex" : "hidden"} items-center gap-2 border-t border-white/10 p-3 md:flex`}>
        <LanguageSwitch className="flex-1 border-white/20 bg-transparent text-white hover:bg-white/10" />
        <form action={logout} className="flex-1">
          <button className="btn w-full border border-white/20 px-3 py-1.5 text-white hover:bg-white/10">{t.nav.logout}</button>
        </form>
      </div>
    </aside>
  );
}
