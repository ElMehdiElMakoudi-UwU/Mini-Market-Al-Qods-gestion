import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { periodParam, PRESETS, presetPeriod, PRODUCT_SORTS, REPORT_VIEWS, type ProductSort, type ReportView } from "@/lib/reports";
import { getDict } from "@/i18n/server";
import { PageHeader } from "@/components/page-header";
import { CashView, CategoriesView, ControlsView, ProductsView, SummaryView } from "./views";

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requireUser("OWNER");
  const { t } = await getDict();
  const sp = await searchParams;
  const period = periodParam(sp);
  const view: ReportView = REPORT_VIEWS.find((v) => v === sp.view) ?? "summary";
  const sort: ProductSort = PRODUCT_SORTS.find((s) => s === sp.sort) ?? "revenue";
  const href = (o: { view?: string; from?: string; to?: string; sort?: string }) =>
    `/reports?${new URLSearchParams({ view, from: period.from, to: period.to, ...(view === "products" ? { sort } : {}), ...o })}`;

  return (
    <div className="space-y-6">
      <PageHeader title={t.reports.title}>
        <a href={`/reports/export?${new URLSearchParams({ view, from: period.from, to: period.to, sort })}`} className="btn-secondary" download>
          ⤓ {t.reports.export}
        </a>
      </PageHeader>

      <div className="card space-y-3 p-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const pp = presetPeriod(p);
            const active = pp.from === period.from && pp.to === period.to;
            return (
              <Link key={p} href={href(pp)} className={`badge px-3 py-1 text-sm ${active ? "bg-brand-600 text-white" : "bg-surface hover:bg-brand-50"}`}>
                {t.reports.presets[p]}
              </Link>
            );
          })}
        </div>
        <form className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="view" value={view} />
          {view === "products" && <input type="hidden" name="sort" value={sort} />}
          <div>
            <label className="label">{t.reports.from}</label>
            <input type="date" name="from" defaultValue={period.from} className="input" />
          </div>
          <div>
            <label className="label">{t.reports.to}</label>
            <input type="date" name="to" defaultValue={period.to} className="input" />
          </div>
          <button className="btn-secondary">{t.reports.apply}</button>
        </form>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-line">
        {REPORT_VIEWS.map((v) => (
          <Link
            key={v}
            href={href({ view: v })}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold ${v === view ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.reports.views[v]}
          </Link>
        ))}
      </nav>

      {view === "summary" && <SummaryView period={period} />}
      {view === "products" && <ProductsView period={period} sort={sort} sortHref={(s) => href({ sort: s })} />}
      {view === "categories" && <CategoriesView period={period} />}
      {view === "cash" && <CashView period={period} />}
      {view === "controls" && <ControlsView period={period} />}
    </div>
  );
}
