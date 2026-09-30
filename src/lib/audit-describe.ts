import { formatMoney } from "./format";

/** A short human summary of an audit entry's details. */
export function describeAudit(d: Record<string, unknown>, locale: string): string {
  const money = (v: unknown) => (typeof v === "number" ? formatMoney(v, locale) : "");
  const parts: string[] = [];
  if (d.number) parts.push(`#${d.number}`);
  if (d.name) parts.push(String(d.name));
  if (Array.isArray(d.salePrice) && d.salePrice[0] !== d.salePrice[1]) parts.push(`${money(d.salePrice[0])} → ${money(d.salePrice[1])}`);
  if (d.from !== undefined && d.to !== undefined) parts.push(`${d.from} → ${d.to}`);
  if (d.type && d.amount) parts.push(`${d.type === "IN" ? "+" : "−"}${money(d.amount)}`);
  else if (d.total !== undefined) parts.push(money(d.total));
  if (d.difference !== undefined) parts.push(`Δ ${money(d.difference)}`);
  if (d.openingCash !== undefined) parts.push(money(d.openingCash));
  if (d.reason) parts.push(`« ${d.reason} »`);
  return parts.join(" · ");
}
