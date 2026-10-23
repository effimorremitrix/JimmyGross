import "server-only";
import { config } from "./config";

/**
 * SMS never carries health data: only the practice name, the date and the link.
 */
export interface SmsSender {
  send(to: string, body: string): Promise<{ id: string }>;
}

class ConsoleSms implements SmsSender {
  async send(to: string, body: string) {
    console.info(`[sms:console] to=${maskPhone(to)} body=${body}`);
    return { id: `console-${Date.now()}` };
  }
}

class TwilioSms implements SmsSender {
  async send(to: string, body: string) {
    const c = config();
    const auth = Buffer.from(`${c.TWILIO_ACCOUNT_SID}:${c.TWILIO_AUTH_TOKEN}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${c.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: toE164(to), From: c.TWILIO_FROM!, Body: body }),
      },
    );
    if (!res.ok) throw new Error(`Twilio error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { sid: string };
    return { id: json.sid };
  }
}

export function smsSender(): SmsSender {
  return config().SMS_PROVIDER === "twilio" ? new TwilioSms() : new ConsoleSms();
}

/** French mobile numbers: "06 12 34 56 78" → "+33612345678". */
export function toE164(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0") && digits.length === 10) return `+33${digits.slice(1)}`;
  return digits;
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length < 4) return "••";
  return `${d.slice(0, 2)} •• •• •• ${d.slice(-2)}`;
}
