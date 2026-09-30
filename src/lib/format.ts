// Shared by server and client code.

export const TIME_ZONE = "Africa/Casablanca";

/** Today's date in Morocco as YYYY-MM-DD. */
export function todayInMorocco(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

/** A YYYY-MM month from a search param, or the current month in Morocco. */
export function monthParam(value: unknown): string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : todayInMorocco().slice(0, 7);
}

/** Parses a user-typed amount in MAD ("12,5" or "12.50") into centimes. */
export function toCents(value: string | number): number {
  const n = typeof value === "number" ? value : parseFloat(value.replace(",", ".").trim());
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatMoney(cents: number, locale: string = "fr"): string {
  const n = (cents / 100).toLocaleString(locale === "ar" ? "ar-MA-u-nu-latn" : "fr-MA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return locale === "ar" ? `${n} د.م` : `${n} DH`;
}

export function roundQty(q: number): number {
  return Math.round(q * 1000) / 1000;
}

export function formatQty(q: number, unit: "PIECE" | "KG"): string {
  if (unit === "KG") return `${roundQty(q).toLocaleString("fr-MA", { maximumFractionDigits: 3 })} kg`;
  return roundQty(q).toLocaleString("fr-MA", { maximumFractionDigits: 3 });
}

export function formatDateTime(d: Date | string, locale: string = "fr"): string {
  return new Date(d).toLocaleString(locale === "ar" ? "ar-MA-u-nu-latn" : "fr-MA", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(d: Date | string, locale: string = "fr"): string {
  return new Date(d).toLocaleTimeString(locale === "ar" ? "ar-MA-u-nu-latn" : "fr-MA", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}
