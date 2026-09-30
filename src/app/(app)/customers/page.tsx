import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { customersWithBalance } from "@/lib/credit";
import { getDict } from "@/i18n/server";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { CustomerForm } from "./customer-form";

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const withDebt = sp.debt === "1";
  const showInactive = sp.inactive === "1";

  const all = await customersWithBalance();
  const owing = all.filter((c) => c.balance > 0);
  const totalOwed = owing.reduce((s, c) => s + c.balance, 0);
  const rows = all
    .filter((c) => showInactive || c.active)
    .filter((c) => !withDebt || c.balance > 0)
    .filter((c) => !q || normalize(c.name).includes(normalize(q)) || c.phone.includes(q))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  const m = (c: number) => formatMoney(c, locale);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t.customers.title} />

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="text-sm text-muted">{t.customers.totalOwed}</div>
          <div className="num mt-1 text-2xl font-bold text-red-600">{m(totalOwed)}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-muted">{t.customers.count}</div>
          <div className="num mt-1 text-2xl font-bold">{owing.length}</div>
        </div>
      </div>

      <details className="card p-4">
        <summary className="cursor-pointer font-semibold text-brand-700">+ {t.customers.new}</summary>
        <div className="mt-4">
          <CustomerForm isOwner={user.role === "OWNER"} />
        </div>
      </details>

      <form className="card flex flex-wrap items-center gap-3 p-3">
        <input name="q" defaultValue={q} placeholder={t.customers.search} className="input min-w-48 flex-1" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="debt" value="1" defaultChecked={withDebt} /> {t.customers.withDebt}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="inactive" value="1" defaultChecked={showInactive} /> {t.customers.showInactive}
        </label>
        <button className="btn-secondary">{t.sales.filter}</button>
      </form>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t.common.empty}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t.common.name}</th>
                <th>{t.common.phone}</th>
                <th>{t.customers.balance}</th>
                <th>{t.pos.limit}</th>
                <th>{t.customers.lastActivity}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const over = c.creditLimit > 0 && c.balance > c.creditLimit;
                return (
                  <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                    <td>
                      <Link href={`/customers/${c.id}`} className="font-semibold text-brand-700 hover:underline">
                        {c.name}
                      </Link>
                      {!c.active && <span className="badge ms-2 bg-surface text-muted">{t.common.inactive}</span>}
                    </td>
                    <td className="num">{c.phone}</td>
                    <td className={`num font-bold ${c.balance > 0 ? "text-red-600" : "text-muted"}`}>
                      {m(c.balance)}
                      {over && <span className="badge ms-2 bg-red-100 text-red-700">{t.customers.overLimit}</span>}
                    </td>
                    <td className="num text-muted">{c.creditLimit > 0 ? m(c.creditLimit) : "—"}</td>
                    <td className="num text-muted">{c.lastEntryAt ? formatDateTime(c.lastEntryAt, locale) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
