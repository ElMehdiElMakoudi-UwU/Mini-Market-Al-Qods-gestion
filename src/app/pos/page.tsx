import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PosApp } from "./pos-app";

export const metadata: Metadata = { title: "Caisse — Al Qods" };

export default async function PosPage() {
  await requireUser();
  return <PosApp />;
}
