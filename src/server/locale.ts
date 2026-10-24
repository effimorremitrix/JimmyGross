import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_LOCALE, isLocale, LOCALES, resolveLocale, type Locale } from "@/domain/i18n";

export type TemplateTranslationRow = typeof schema.templateTranslations.$inferSelect;

/** Approved translations of a template version (French, the source, is not a row). */
export async function approvedTranslations(versionId: string): Promise<TemplateTranslationRow[]> {
  const rows = await db.query.templateTranslations.findMany({
    where: and(eq(schema.templateTranslations.templateVersionId, versionId), isNotNull(schema.templateTranslations.approvedAt)),
  });
  return rows.filter((r) => isLocale(r.locale));
}

/** Languages a patient can read this version in: French plus every approved translation. */
export async function availableLocales(versionId: string): Promise<Locale[]> {
  const approved = (await approvedTranslations(versionId)).map((r) => r.locale);
  return LOCALES.filter((l) => l === DEFAULT_LOCALE || approved.includes(l));
}

/** The language a request is actually delivered in, with its approved translation (null for French). */
export async function effectiveLocale(
  versionId: string,
  requested: string | null | undefined,
): Promise<{ locale: Locale; translation: TemplateTranslationRow | null }> {
  const rows = await approvedTranslations(versionId);
  const locale = resolveLocale(
    requested,
    rows.map((r) => r.locale),
  );
  return { locale, translation: rows.find((r) => r.locale === locale) ?? null };
}
