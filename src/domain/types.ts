export type SignatureLevel = "SES" | "AES";

/** A block of patient information the patient must read and acknowledge. */
export interface InfoSection {
  id: string;
  title: string;
  /** Paragraphs of body text. */
  paragraphs: string[];
  /** Optional bullet lists, each with an optional heading and a tone. */
  callouts?: { heading: string; tone: "neutral" | "info" | "warn" | "danger" | "ok"; items: string[] }[];
}

export type FlagSeverity = "info" | "warn" | "block";

/** A yes/no Pre-Check question; "yes" may raise a flag for the practitioner. */
export interface Question {
  id: string;
  text: string;
  /** Ask for details when the answer is yes (e.g. the drug name). */
  detailPrompt?: string;
  flag?: { severity: FlagSeverity; message: string; patientNotice: string };
  /** Only show when the planned act matches one of these keywords. */
  onlyForActs?: string[];
}

export interface ConsentBlock {
  /** The statement the patient acknowledges, in full. */
  statement: string[];
  /** Acts the practitioner may select; the planned one is prefilled. */
  actOptions: string[];
  /** Whether an emergency contact is collected. */
  collectEmergencyContact: boolean;
}

export interface PrecheckAnswer {
  answer: "oui" | "non";
  detail?: string;
}

export interface PrecheckAnswers {
  items: Record<string, PrecheckAnswer>;
  emergencyContact?: { name: string; phone: string; relation: string };
}

export type RequestStatus =
  | "created"
  | "sent"
  | "opened"
  | "info_read"
  | "precheck_done"
  | "awaiting_otp"
  | "awaiting_provider"
  | "signed"
  | "expired"
  | "cancelled";
