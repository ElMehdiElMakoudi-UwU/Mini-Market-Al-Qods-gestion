"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function login(_prev: { error?: boolean } | undefined, formData: FormData) {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const [user] = await db.select().from(users).where(eq(users.username, username));
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: true };
  }
  await createSession(user.id);
  await audit(user.id, "login");
  redirect(user.role === "OWNER" ? "/dashboard" : "/pos");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function setLanguage(locale: "fr" | "ar") {
  (await cookies()).set("lang", locale === "ar" ? "ar" : "fr", {
    path: "/",
    maxAge: 365 * 86400,
    sameSite: "lax",
  });
}

export async function whoAmI() {
  return getCurrentUser();
}
