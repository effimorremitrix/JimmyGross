import "server-only";
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { parisDayRange } from "@/lib/dates";
import { effectiveLocale } from "./locale";

export type DayRow = Awaited<ReturnType<typeof dayView>>["rows"][number];

/** Everything the day screen needs, in one pass. */
export async function dayView(practiceId: string, ymd: string) {
  const [start, end] = parisDayRange(ymd);
  const appts = await db
    .select()
    .from(schema.appointments)
    .where(and(eq(schema.appointments.practiceId, practiceId), gte(schema.appointments.scheduledAt, start), lt(schema.appointments.scheduledAt, end)))
    .orderBy(asc(schema.appointments.scheduledAt));
  if (!appts.length) return { rows: [], kpi: { total: 0, signed: 0, pending: 0, alerts: 0 } };

  const apptIds = appts.map((a) => a.id);
  const requests = await db.select().from(schema.consentRequests).where(inArray(schema.consentRequests.appointmentId, apptIds));
  const reqIds = requests.map((r) => r.id);
  const [patients, flags, reads] = await Promise.all([
    db.select().from(schema.patients).where(inArray(schema.patients.id, appts.map((a) => a.patientId))),
    reqIds.length ? db.select().from(schema.precheckFlags).where(inArray(schema.precheckFlags.requestId, reqIds)) : [],
    reqIds.length ? db.select().from(schema.readingEvents).where(inArray(schema.readingEvents.requestId, reqIds)) : [],
  ]);

  const rows = appts.map((a) => {
    const patient = patients.find((p) => p.id === a.patientId)!;
    const request = requests
      .filter((r) => r.appointmentId === a.id && r.status !== "cancelled")
      .sort((x, y) => +y.createdAt - +x.createdAt)[0];
    const rFlags = request ? flags.filter((f) => f.requestId === request.id) : [];
    const rReads = request ? reads.filter((e) => e.requestId === request.id && e.acknowledgedAt) : [];
    const fullTextCount = request ? reads.filter((e) => e.requestId === request.id && e.fullTextOpenedAt).length : 0;
    return {
      appointment: a,
      patient,
      request: request ?? null,
      flags: rFlags,
      readCount: rReads.length,
      fullTextCount,
      readMs: rReads.reduce((s, e) => s + e.visibleMs, 0),
    };
  });

  const openAlerts = rows.flatMap((r) => r.flags.filter((f) => !f.reviewedAt && f.severity !== "info"));
  return {
    rows,
    kpi: {
      total: rows.filter((r) => r.request).length,
      signed: rows.filter((r) => r.request?.status === "signed").length,
      pending: rows.filter((r) => r.request && r.request.status !== "signed").length,
      alerts: openAlerts.length,
    },
  };
}

/** One request with everything the detail screen shows; scoped to the practice. */
export async function requestDetail(practiceId: string, requestId: string) {
  const request = await db.query.consentRequests.findFirst({
    where: and(eq(schema.consentRequests.id, requestId), eq(schema.consentRequests.practiceId, practiceId)),
  });
  if (!request) return null;
  const [patient, appointment, version, flags, reads, events, docs] = await Promise.all([
    db.query.patients.findFirst({ where: eq(schema.patients.id, request.patientId) }),
    db.query.appointments.findFirst({ where: eq(schema.appointments.id, request.appointmentId) }),
    db.query.templateVersions.findFirst({ where: eq(schema.templateVersions.id, request.templateVersionId) }),
    db.select().from(schema.precheckFlags).where(eq(schema.precheckFlags.requestId, request.id)),
    db.select().from(schema.readingEvents).where(eq(schema.readingEvents.requestId, request.id)),
    db.select().from(schema.auditEvents).where(eq(schema.auditEvents.requestId, request.id)).orderBy(asc(schema.auditEvents.at)),
    db
      .select({ id: schema.documents.id, kind: schema.documents.kind, sha256: schema.documents.sha256, createdAt: schema.documents.createdAt })
      .from(schema.documents)
      .where(eq(schema.documents.requestId, request.id))
      .orderBy(desc(schema.documents.createdAt)),
  ]);
  if (!patient || !appointment || !version) return null;
  const { locale, translation } = await effectiveLocale(request.templateVersionId, request.locale);
  const approver = translation?.approvedById
    ? await db.query.users.findFirst({ where: eq(schema.users.id, translation.approvedById) })
    : null;
  /** Requested vs actually delivered language (French when the translation is not approved). */
  const language = {
    requested: request.locale,
    effective: locale,
    approvedAt: translation?.approvedAt ?? null,
    approvedBy: approver?.name ?? null,
  };
  return { request, patient, appointment, version, flags, reads, events, docs, language };
}
