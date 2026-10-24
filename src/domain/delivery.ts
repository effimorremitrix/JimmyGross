export type DeliveryChannel = "sms" | "email" | "sms_email" | "manual_link";
export type ChannelPref = "sms_first" | "email_first" | "both";

/** Best channel given a preference and the contact details we have (null: unreachable). */
export function pickChannel(pref: ChannelPref, phone: string | null, email: string | null): DeliveryChannel | null {
  if (!phone && !email) return null;
  if (pref === "both") return phone && email ? "sms_email" : phone ? "sms" : "email";
  if (pref === "email_first") return email ? "email" : "sms";
  return phone ? "sms" : "email";
}

/** When the link should go out: lead time before the appointment, never in the past. */
export function sendTimeFor(appointmentAt: Date, leadHours: number, now = new Date()): Date {
  const t = new Date(appointmentAt.getTime() - leadHours * 3600 * 1000);
  return t > now ? t : now;
}
