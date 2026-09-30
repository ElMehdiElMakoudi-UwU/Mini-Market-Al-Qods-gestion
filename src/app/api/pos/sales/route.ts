import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { recordSale, saleInput } from "@/lib/sales";

// Receives sales queued on the POS (one or many, e.g. after being offline).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = z.object({ sales: z.array(saleInput).max(500) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const accepted: Record<string, number> = {};
  const failed: Record<string, string> = {};
  for (const sale of parsed.data.sales) {
    try {
      accepted[sale.id] = await recordSale(sale, user.id);
    } catch (e) {
      console.error("Sale sync failed", sale.id, e);
      failed[sale.id] = e instanceof Error ? e.message : "error";
    }
  }
  return NextResponse.json({ accepted, failed });
}
