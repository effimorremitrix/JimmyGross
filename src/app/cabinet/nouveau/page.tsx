import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { parisYmd, shiftYmd } from "@/lib/dates";
import { NewRequestForm } from "./new-request-form";

export const metadata: Metadata = { title: "Nouvelle demande de consentement" };

export default async function NewRequestPage() {
  const staff = await requireStaff();
  const reasons = await db.query.visitReasons.findMany({ where: eq(schema.visitReasons.practiceId, staff.practiceId) });
  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-[26px] font-bold">Nouvelle demande</h1>
      <p className="mt-1 text-[15px] text-muted">
        Le patient reçoit un lien par SMS, ou vous collez le lien dans le message de rendez-vous Doctolib.
      </p>
      <NewRequestForm
        reasons={reasons.map((r) => ({ id: r.id, label: r.label, act: r.defaultAct, aes: r.signatureLevelOverride === "AES" }))}
        defaultDate={shiftYmd(parisYmd(), 3)}
      />
    </div>
  );
}
