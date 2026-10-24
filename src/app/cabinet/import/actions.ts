"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth";
import { commitImport, previewImport, MAX_IMPORT_BYTES, type ChannelPref, type SendPref } from "@/server/agenda-import";

const prefsSchema = z.object({ channel: z.enum(["sms_first", "email_first", "both"]), send: z.enum(["scheduled", "now"]) });

export async function preview(text: string, prefs: { channel: ChannelPref; send: SendPref }) {
  const staff = await requireStaff();
  const p = prefsSchema.parse(prefs);
  if (typeof text !== "string" || text.length > MAX_IMPORT_BYTES) {
    return { ok: false as const, error: "Fichier invalide ou trop volumineux (2 Mo maximum)." };
  }
  return previewImport(staff.practiceId, text, p);
}

export async function commit(filename: string, text: string, prefs: { channel: ChannelPref; send: SendPref }) {
  const staff = await requireStaff();
  const p = prefsSchema.parse(prefs);
  const res = await commitImport(staff.practiceId, staff.userId, String(filename), String(text), p);
  revalidatePath("/cabinet");
  return res;
}

const mapSchema = z.object({ label: z.string().trim().min(1).max(120), templateId: z.string().uuid(), act: z.string().trim().min(1).max(120) });

/** Links a Doctolib motif seen in the file to a consent template. */
export async function mapMotif(input: { label: string; templateId: string; act: string }): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const v = mapSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Champs manquants." };
  const t = await db.query.templates.findFirst({
    where: and(eq(schema.templates.id, v.data.templateId), eq(schema.templates.practiceId, staff.practiceId)),
  });
  if (!t) return { ok: false, error: "Modèle inconnu." };
  await db.insert(schema.visitReasons).values({ practiceId: staff.practiceId, label: v.data.label, templateId: t.id, defaultAct: v.data.act });
  await audit({ practiceId: staff.practiceId, actor: `user:${staff.userId}`, type: "motif.mapped", data: v.data });
  revalidatePath("/cabinet/modeles");
  return { ok: true };
}
