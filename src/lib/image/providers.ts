import "server-only";

/**
 * Provider-agnostic image generation. Each adapter implements `generate`.
 * Availability is derived from whether the provider's API key is set in the
 * server env — never exposed to the browser.
 */
export type GeneratedImage = {
  /** raw image bytes */
  data: Buffer;
  mimeType: string;
  ext: "png" | "jpg";
};

export type ImageResult = {
  images: GeneratedImage[];
  costUsd: number;
};

export const IMAGE_ASPECT_RATIOS = ["1:1", "4:5", "3:2", "2:3", "16:9", "9:16"] as const;
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export type ReferenceImageInput = {
  id: string;
  data: Buffer;
  mimeType: string;
};

export type ImageGenerationRequest = {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  referenceImages: ReferenceImageInput[];
};

export type ImageModelCapabilities = {
  aspectRatios: readonly ImageAspectRatio[];
  referenceImages: boolean;
  /** Editing models can require at least one uploaded source image. */
  referenceImagesRequired?: boolean;
  maxReferenceImages: number;
  maxVariations: number;
};

export interface ImageProvider {
  id: string;
  provider: string;
  model: string;
  label: string;
  strengths: string;
  /** default indicative price per image; the live price comes from the pricing table */
  indicativePricePerImage: number;
  capabilities: ImageModelCapabilities;
  isConfigured(): Promise<boolean>;
  generate(request: ImageGenerationRequest, apiKeyId?: string): Promise<ImageResult>;
}
