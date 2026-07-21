import type { Language } from "@/db/schema";

export function articleMaxTokens(length: string, language: Language): number {
  const values = [...length.matchAll(/\d{2,4}/g)].map((match) => Number(match[0]));
  const maximumWords = values.length ? Math.max(...values) : 1500;
  const singleLanguage = maximumWords <= 1200 ? 3200 : maximumWords <= 1600 ? 4400 : 6000;
  return language === "both" ? Math.min(10000, singleLanguage * 2) : singleLanguage;
}
