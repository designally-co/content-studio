import "server-only";
import type { ImageProvider } from "./providers";
import { falProviders } from "./fal";
import { getApiKeyOptions, type ApiKeyProvider } from "@/lib/secrets";

const PROVIDERS: ImageProvider[] = [
  ...falProviders,
];

export function getImageProvider(id: string): ImageProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** One selectable (provider, key) combo for a generation-time dropdown. */
export type ImageGenerationOption = {
  /** `${providerId}::${keyId}` — pass straight to generateImagesAction and split there. */
  optionId: string;
  providerId: string;
  keyId: string;
  label: string;
  provider: string;
  model: string;
  /** Pairs a text-to-image entry with the editing entry in the same line. */
  family: string;
  strengths: string;
  capabilities: ImageProvider["capabilities"];
  indicativePricePerImage: number;
};

/**
 * Flattens providers × saved keys into a single option list — one row per
 * provider when it has one saved key, or one
 * row per saved key when a provider has more than one.
 */
export async function imageGenerationOptions(): Promise<ImageGenerationOption[]> {
  const options: ImageGenerationOption[] = [];
  for (const p of PROVIDERS) {
    const keyOptions = await getApiKeyOptions(p.provider as ApiKeyProvider);
    if (keyOptions.length === 0) continue;
    for (const k of keyOptions) {
      options.push({
        optionId: `${p.id}::${k.id}`,
        providerId: p.id,
        keyId: k.id,
        label: keyOptions.length > 1 ? `${p.label} — ${k.label}` : p.label,
        provider: p.provider,
        model: p.model,
        family: p.family,
        strengths: p.strengths,
        capabilities: p.capabilities,
        indicativePricePerImage: p.indicativePricePerImage,
      });
    }
  }
  return options;
}
