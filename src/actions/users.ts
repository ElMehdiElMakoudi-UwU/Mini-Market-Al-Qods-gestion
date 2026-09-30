"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

type State = { error?: string; ok?: boolean } | undefined;

export async function saveUser(_prev: State, formData: FormData): Promise<State> {
  const me = await requireUser("OWNER");
  const id = Number(formData.get("id")) || null;
  const name = String(formData.get("name") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = formData.get("role") === "OWNER" ? "OWNER" : "MANAGER";
  const active = id ? formData.get("active") === "on" : true;
  if (!name || !username) return { error: "required" };
  if ((!id || password) && password.length < 4) return { error: "passwordShort" };
  if (id === me.id && !active) return { error: "cannotDisableSelf" };

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (taken && taken.id !== id) return { error: "usernameTaken" };

  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
  if (id) {
    await db
      .update(users)
      .set({ name, username, role: id === me.id ? me.role : role, active, ...(passwordHash ? { passwordHash } : {}) })
      .where(eq(users.id, id));
    // Disabling an account or changing its password signs it out everywhere.
    if (!active || passwordHash) await db.delete(sessions).where(eq(sessions.userId, id));
    await audit(me.id, "user_update", { userId: id, name, active, passwordChanged: !!passwordHash });
  } else {
    const [u] = await db.insert(users).values({ name, username, role, passwordHash: passwordHash! }).returning({ id: users.id });
    await audit(me.id, "user_create", { userId: u.id, name, role });
  }
  revalidatePath("/users");
  return { ok: true };
}
