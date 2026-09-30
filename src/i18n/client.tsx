"use client";

import { createContext, useContext } from "react";
import { fr, type Dict } from "./fr";
import { ar } from "./ar";

const I18nContext = createContext<{ t: Dict; locale: "fr" | "ar" }>({ t: fr, locale: "fr" });

export function I18nProvider({ locale, children }: { locale: "fr" | "ar"; children: React.ReactNode }) {
  return (
    <I18nContext.Provider value={{ t: locale === "ar" ? ar : fr, locale }}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

/** Product name in the current language, falling back to French. */
export function productName(p: { nameFr: string; nameAr: string }, locale: "fr" | "ar") {
  return locale === "ar" && p.nameAr ? p.nameAr : p.nameFr;
}
