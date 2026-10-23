import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "./config";

const STAFF_COOKIE = "cz_staff";
const PATIENT_COOKIE = "cz_patient";
const STAFF_TTL_S = 60 * 60 * 10; // one working day
const PATIENT_TTL_S = 60 * 60 * 2;

function key() {
  return new TextEncoder().encode(config().SESSION_SECRET);
}

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config().APP_URL.startsWith("https://"),
    path: "/",
    maxAge,
  };
}

// ---------- clinic staff ----------

export interface StaffSession {
  userId: string;
  practiceId: string;
  name: string;
  role: "practitioner" | "assistant" | "admin";
}

export async function startStaffSession(s: StaffSession) {
  const jwt = await new SignJWT({ ...s, kind: "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STAFF_TTL_S}s`)
    .sign(key());
  (await cookies()).set(STAFF_COOKIE, jwt, cookieOpts(STAFF_TTL_S));
}

export async function endStaffSession() {
  (await cookies()).delete(STAFF_COOKIE);
}

export async function getStaff(): Promise<StaffSession | null> {
  const raw = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, key());
    if (payload.kind !== "staff") return null;
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, String(payload.userId)) });
    if (!user) return null;
    return { userId: user.id, practiceId: user.practiceId, name: user.name, role: user.role };
  } catch {
    return null;
  }
}

/** Use at the top of every staff page and staff server action. */
export async function requireStaff(): Promise<StaffSession> {
  const s = await getStaff();
  if (!s) redirect("/login");
  return s;
}

// ---------- patient (scoped to one request) ----------

export async function startPatientSession(requestId: string) {
  const jwt = await new SignJWT({ requestId, kind: "patient" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PATIENT_TTL_S}s`)
    .sign(key());
  (await cookies()).set(PATIENT_COOKIE, jwt, cookieOpts(PATIENT_TTL_S));
}

/** True when this browser passed the birth-date check for this request. */
export async function hasPatientSession(requestId: string): Promise<boolean> {
  const raw = (await cookies()).get(PATIENT_COOKIE)?.value;
  if (!raw) return false;
  try {
    const { payload } = await jwtVerify(raw, key());
    return payload.kind === "patient" && payload.requestId === requestId;
  } catch {
    return false;
  }
}
