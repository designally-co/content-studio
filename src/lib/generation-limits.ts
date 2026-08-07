import type { Language } from "@/db/schema";

export function articleMaxTokens(length: string, language: Language): number {
  // Thousands separators are stripped first: "1,200–2,000 words" must read as
  // 1200–2000, not as the 200 its comma-split fragments used to parse to.
  const values = [...length.replace(/,/g, "").matchAll(/\d{2,5}/g)].map((match) => Number(match[0]));
  const maximumWords = values.length ? Math.max(...values) : 1500;
  const singleLanguage = maximumWords <= 1200 ? 3200 : maximumWords <= 1600 ? 4400 : 6000;
  return language === "both" ? Math.min(10000, singleLanguage * 2) : singleLanguage;
}
