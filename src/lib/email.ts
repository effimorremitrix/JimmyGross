import "server-only";
import nodemailer from "nodemailer";
import { config } from "./config";

/** E-mails never carry health data: practitioner, date, link. */
export interface EmailSender {
  send(to: string, subject: string, text: string, html: string): Promise<{ id: string }>;
}

class ConsoleEmail implements EmailSender {
  async send(to: string, subject: string, text: string) {
    console.info(`[email:console] to=${maskEmail(to)} subject="${subject}" body=${text.replace(/\s+/g, " ").slice(0, 300)}`);
    return { id: `console-${Date.now()}` };
  }
}

class SmtpEmail implements EmailSender {
  private transport = nodemailer.createTransport(config().SMTP_URL!);
  async send(to: string, subject: string, text: string, html: string) {
    const info = await this.transport.sendMail({ from: config().EMAIL_FROM, to, subject, text, html });
    return { id: info.messageId };
  }
}

export function emailSender(): EmailSender {
  return config().EMAIL_PROVIDER === "smtp" ? new SmtpEmail() : new ConsoleEmail();
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  return `${user.slice(0, 1)}•••@${domain}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Plain, accessible e-mail with one button. */
export function linkEmail(p: { practitioner: string; dateLabel: string; link: string; practicePhone: string }) {
  const subject = `${p.practitioner} : vos documents avant le rendez-vous du ${p.dateLabel}`;
  const text = [
    "Bonjour,",
    "",
    `Avant votre rendez-vous du ${p.dateLabel} avec ${p.practitioner}, merci de lire la fiche d'information, de répondre au questionnaire et de signer votre consentement (environ 5 minutes) :`,
    p.link,
    "",
    `Une question ? Cabinet : ${p.practicePhone}`,
    "Ne répondez pas à ce message.",
  ].join("\n");
  const html = `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#12233a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
<p>Bonjour,</p>
<p>Avant votre rendez-vous du <strong>${esc(p.dateLabel)}</strong> avec ${esc(p.practitioner)}, merci de lire la fiche d'information, de répondre au questionnaire et de signer votre consentement (environ 5 minutes).</p>
<p><a href="${esc(p.link)}" style="display:inline-block;background:#1f5fa8;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Compléter mes documents</a></p>
<p style="font-size:14px;color:#4a5b70">Une question ? Cabinet : ${esc(p.practicePhone)}<br>Ne répondez pas à ce message.</p>
</body></html>`;
  return { subject, text, html };
}
