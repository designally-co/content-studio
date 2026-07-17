import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import type { LogoOverlay, LogoPosition } from "@/db/schema";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 1×1 RGBA tile used to multiply an image's alpha by `opacity` via `dest-in`. */
function opacityTile(opacity: number): Buffer {
  return Buffer.from([255, 255, 255, Math.round(clamp(opacity, 0, 1) * 255)]);
}

function place(
  pos: LogoPosition,
  W: number,
  H: number,
  lw: number,
  lh: number,
  pad: number
): { x: number; y: number } {
  let x: number;
  let y: number;
  switch (pos) {
    case "top-left":
      x = pad;
      y = pad;
      break;
    case "top-right":
      x = W - lw - pad;
      y = pad;
      break;
    case "bottom-left":
      x = pad;
      y = H - lh - pad;
      break;
    case "center":
      x = Math.round((W - lw) / 2);
      y = Math.round((H - lh) / 2);
      break;
    case "bottom-right":
    default:
      x = W - lw - pad;
      y = H - lh - pad;
      break;
  }
  return {
    x: Math.max(0, Math.min(Math.round(x), W - lw)),
    y: Math.max(0, Math.min(Math.round(y), H - lh)),
  };
}

/**
 * Composite a brand logo onto a generated image per the overlay settings.
 * Resizes the logo to a % of the image width, applies uniform opacity, an
 * optional subtle drop-shadow, and positions it in the chosen corner/center.
 * Returns PNG bytes. Non-destructive — the caller keeps the original image.
 */
export async function compositeLogo(
  baseBytes: Buffer,
  logoBytes: Buffer,
  overlay: LogoOverlay
): Promise<Buffer> {
  const meta = await sharp(baseBytes).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;

  const sizePct = clamp(overlay.sizePct, 1, 60);
  const opacity = clamp(overlay.opacity, 0, 1);
  const targetW = Math.max(1, Math.min(W, Math.round((W * sizePct) / 100)));

  // Resize the logo to the target width, preserving aspect + transparency.
  let logo = await sharp(logoBytes)
    .resize({ width: targetW })
    .ensureAlpha()
    .png()
    .toBuffer();
  const lm = await sharp(logo).metadata();
  const lw = lm.width ?? targetW;
  const lh = lm.height ?? targetW;

  // Uniform opacity: multiply the logo's alpha channel.
  if (opacity < 1) {
    logo = await sharp(logo)
      .composite([
        {
          input: opacityTile(opacity),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer();
  }

  const pad = Math.round(W * 0.04);
  const { x, y } = place(overlay.position, W, H, lw, lh, pad);

  const layers: OverlayOptions[] = [];

  if (overlay.shadow) {
    const blur = Math.max(1.5, targetW * 0.02);
    const off = Math.max(2, Math.round(targetW * 0.02));
    // Black silhouette from the logo's alpha, blurred and softened.
    const shadow = await sharp(logo)
      .composite([
        {
          input: Buffer.from([0, 0, 0, 255]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: "in",
        },
      ])
      .blur(blur)
      .composite([
        {
          input: opacityTile(0.4),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer();
    layers.push({
      input: shadow,
      left: Math.max(0, Math.min(x + off, W - lw)),
      top: Math.max(0, Math.min(y + off, H - lh)),
    });
  }

  layers.push({ input: logo, left: x, top: y });

  return sharp(baseBytes).composite(layers).png().toBuffer();
}
