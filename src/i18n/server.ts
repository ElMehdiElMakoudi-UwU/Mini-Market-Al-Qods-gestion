import "server-only";
import { cookies } from "next/headers";
import { fr } from "./fr";
import { ar } from "./ar";

export type Locale = "fr" | "ar";

export async function getLocale(): Promise<Locale> {
  return (await cookies()).get("lang")?.value === "ar" ? "ar" : "fr";
}

export async function getDict() {
  const locale = await getLocale();
  return { t: locale === "ar" ? ar : fr, locale };
}
