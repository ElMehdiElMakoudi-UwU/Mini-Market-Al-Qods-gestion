import "server-only";
import { db, type Tx } from "@/db";
import { auditLogs } from "@/db/schema";

export async function audit(
  userId: number | null,
  action: string,
  details: Record<string, unknown> = {},
  tx: Tx | typeof db = db,
) {
  await tx.insert(auditLogs).values({ userId, action, details });
}
