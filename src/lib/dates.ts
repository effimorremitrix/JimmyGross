const TZ = "Europe/Paris";

/** YYYY-MM-DD of a date in Paris time. */
export function parisYmd(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/** Offset of Paris from UTC (minutes) at a given instant. */
function parisOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** A Paris wall-clock time ("YYYY-MM-DD", "HH:MM") as a UTC instant. */
export function parisToUtc(ymd: string, hhmm: string): Date {
  const naive = new Date(`${ymd}T${hhmm}:00Z`);
  const offset = parisOffsetMinutes(naive);
  const guess = new Date(naive.getTime() - offset * 60000);
  const fix = parisOffsetMinutes(guess);
  return fix === offset ? guess : new Date(naive.getTime() - fix * 60000);
}

/** [start, end) of a Paris calendar day, in UTC. */
export function parisDayRange(ymd: string): [Date, Date] {
  const start = parisToUtc(ymd, "00:00");
  const next = shiftYmd(ymd, 1);
  return [start, parisToUtc(next, "00:00")];
}

export function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isYmd(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function frTime(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);
}

export function frDay(ymd: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${ymd}T12:00:00Z`),
  );
}

export function frDateTime(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(d);
}
