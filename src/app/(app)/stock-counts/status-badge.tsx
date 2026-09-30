import { getDict } from "@/i18n/server";

const TONES: Record<string, string> = {
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  SUBMITTED: "bg-blue-100 text-blue-800",
  APPROVED: "bg-brand-50 text-brand-700",
  CANCELLED: "bg-surface text-muted",
};

export async function StatusBadge({ status }: { status: string }) {
  const { t } = await getDict();
  return <span className={`badge ${TONES[status] ?? ""}`}>{t.stockCounts.status[status] ?? status}</span>;
}
