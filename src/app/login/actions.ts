"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { endStaffSession, startStaffSession } from "@/lib/auth";

let dummyHash: string | undefined;

export async function login(_: { error?: string; email?: string } | undefined, form: FormData): Promise<{ error?: string; email?: string }> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = email ? await db.query.users.findFirst({ where: eq(schema.users.email, email) }) : undefined;
  // Compare even when the user is unknown, so timing does not reveal accounts.
  dummyHash ??= await bcrypt.hash("timing-equaliser", 12);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
  if (!user || !ok) return { error: "E-mail ou mot de passe incorrect.", email };
  await startStaffSession({ userId: user.id, practiceId: user.practiceId, name: user.name, role: user.role });
  await audit({ practiceId: user.practiceId, actor: `user:${user.id}`, type: "staff.login" });
  redirect("/cabinet");
}

export async function logout() {
  await endStaffSession();
  redirect("/login");
}
