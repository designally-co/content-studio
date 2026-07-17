import "server-only";
import type {
  GeneratedImage,
  ImageAspectRatio,
  ImageGenerationRequest,
  ImageProvider,
  ImageResult,
} from "./providers";
import { getApiKey } from "@/lib/secrets";

const FAL_RATIOS = ["1:1", "4:5", "3:2", "2:3", "16:9", "9:16"] as const;

type FalModelConfig = {
  endpoint: string;
  label: string;
  strengths: string;
  mode: "generate" | "edit";
  family: "nano-banana" | "seedream";
  maxReferenceImages: number;
  indicativePricePerImage: number;
};

type FalImage = {
  url?: string;
  content_type?: string;
};

type FalResponse = {
  images?: FalImage[];
  detail?: unknown;
};

function createFalProvider(config: FalModelConfig): ImageProvider {
  return {
    id: `fal:${config.endpoint}`,
    provider: "fal",
    model: config.endpoint,
    label: config.label,
    strengths: config.strengths,
    indicativePricePerImage: config.indicativePricePerImage,
    capabilities: {
      aspectRatios: FAL_RATIOS,
      referenceImages: config.mode === "edit",
      referenceImagesRequired: config.mode === "edit",
      maxReferenceImages: config.maxReferenceImages,
      maxVariations: 4,
    },
    async isConfigured() {
      return Boolean(await getApiKey("fal"));
    },
    async generate(request: ImageGenerationRequest, apiKeyId?: string): Promise<ImageResult> {
      const key = await getApiKey("fal", apiKeyId);
      if (!key) throw new Error("No Fal.ai API key is configured in Settings");
      if (config.mode === "edit" && request.referenceImages.length === 0) {
        throw new Error(`${config.label} requires a reference image.`);
      }

      const imageUrls = request.referenceImages.map(
        (image) => `data:${image.mimeType};base64,${image.data.toString("base64")}`
      );
      const input: Record<string, unknown> = {
        prompt: request.prompt,
        num_images: 1,
      };

      if (config.family === "nano-banana") {
        input.aspect_ratio = request.aspectRatio;
        input.output_format = "png";
        input.resolution = "1K";
        input.limit_generations = true;
      } else {
        input.image_size = seedreamSize(request.aspectRatio);
        input.max_images = 1;
        input.enable_safety_checker = true;
      }
      if (config.mode === "edit") input.image_urls = imageUrls;

      const response = await fetch(`https://fal.run/${config.endpoint}`, {
        method: "POST",
        headers: {
          authorization: `Key ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Fal.ai image error ${response.status}: ${detail.slice(0, 400)}`);
      }

      const payload = (await response.json()) as FalResponse;
      const images = await Promise.all((payload.images ?? []).map(downloadFalImage));
      if (images.length === 0) throw new Error("Fal.ai returned no image data.");
      return { images, costUsd: 0 };
    },
  };
}

async function downloadFalImage(image: FalImage): Promise<GeneratedImage> {
  if (!image.url) throw new Error("Fal.ai returned an image without a URL.");
  if (image.url.startsWith("data:image/")) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/.exec(image.url);
    if (!match) throw new Error("Fal.ai returned an invalid image data URI.");
    const mimeType = match[1];
    return {
      data: Buffer.from(match[2], "base64"),
      mimeType,
      ext: mimeType === "image/jpeg" ? "jpg" : "png",
    };
  }

  const url = new URL(image.url);
  if (url.protocol !== "https:") throw new Error("Fal.ai returned an unsafe image URL.");
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Could not download Fal.ai output (${response.status}).`);
  const mimeType = response.headers.get("content-type") ?? image.content_type ?? "image/png";
  return {
    data: Buffer.from(await response.arrayBuffer()),
    mimeType,
    ext: mimeType.includes("jpeg") ? "jpg" : "png",
  };
}

function seedreamSize(ratio: ImageAspectRatio): { width: number; height: number } {
  const sizes: Record<ImageAspectRatio, { width: number; height: number }> = {
    "1:1": { width: 2048, height: 2048 },
    "4:5": { width: 1792, height: 2240 },
    "3:2": { width: 2496, height: 1664 },
    "2:3": { width: 1664, height: 2496 },
    "16:9": { width: 2688, height: 1512 },
    "9:16": { width: 1512, height: 2688 },
  };
  return sizes[ratio];
}

export const falProviders: ImageProvider[] = [
  createFalProvider({
    endpoint: "fal-ai/nano-banana-2",
    label: "Fal.ai · Nano Banana 2",
    strengths: "Fast image generation with broad ratios and strong prompt understanding",
    mode: "generate",
    family: "nano-banana",
    maxReferenceImages: 0,
    indicativePricePerImage: 0,
  }),
  createFalProvider({
    endpoint: "fal-ai/nano-banana-2/edit",
    label: "Fal.ai · Nano Banana 2 Edit",
    strengths: "Reference-guided editing, product variations, compositing, and style transfer",
    mode: "edit",
    family: "nano-banana",
    maxReferenceImages: 14,
    indicativePricePerImage: 0,
  }),
  createFalProvider({
    endpoint: "fal-ai/bytedance/seedream/v5/lite/text-to-image",
    label: "Fal.ai · Seedream 5 Lite",
    strengths: "Fast high-resolution advertising, product mockups, and creative generation",
    mode: "generate",
    family: "seedream",
    maxReferenceImages: 0,
    indicativePricePerImage: 0.035,
  }),
  createFalProvider({
    endpoint: "fal-ai/bytedance/seedream/v5/lite/edit",
    label: "Fal.ai · Seedream 5 Lite Edit",
    strengths: "High-resolution multi-reference editing for products and campaign assets",
    mode: "edit",
    family: "seedream",
    maxReferenceImages: 10,
    indicativePricePerImage: 0.035,
  }),
];
