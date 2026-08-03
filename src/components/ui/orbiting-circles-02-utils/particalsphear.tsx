"use client";

import { useEffect, useRef } from "react";

/**
 * A lightweight canvas particle sphere — points distributed on a sphere
 * (Fibonacci), rotated about the Y axis and projected to 2D with depth-based
 * size/opacity. Self-contained (no three.js). Colour is inherited from the
 * canvas's CSS `color`, so it themes via a Tailwind text-* class. Honours
 * `prefers-reduced-motion` by rendering a single static frame.
 */
export default function ParticleSphereAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // A spread of oranges (light → deep) so the globe reads as many shades,
    // not one flat colour. Each point keeps its shade for the session.
    const palette = ["#ffb185", "#ff8a5c", "#f66341", "#e14e2d", "#c03e21"];

    // Points on a unit sphere via the Fibonacci lattice (even distribution).
    const COUNT = 2600;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const points = Array.from({ length: COUNT }, (_, i) => {
      const y = 1 - (i / (COUNT - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;
      return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
    });
    const rotated = points.map((p) => ({
      x: p.x,
      y: p.y,
      z: p.z,
      c: palette[(Math.random() * palette.length) | 0],
    }));

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let angle = 0;
    let raf = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.47;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);

      // Rotate about the Y axis, then draw back-to-front so nearer points layer
      // over farther ones — the depth cue that reads as a solid globe.
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        rotated[i].x = p.x * cos - p.z * sin;
        rotated[i].y = p.y;
        rotated[i].z = p.x * sin + p.z * cos;
      }
      rotated.sort((a, b) => a.z - b.z);

      for (const r of rotated) {
        const depth = (r.z + 1) / 2; // 0 (back) → 1 (front)
        ctx.globalAlpha = 0.06 + Math.pow(depth, 1.5) * 0.9;
        ctx.fillStyle = r.c;
        ctx.beginPath();
        ctx.arc(cx + r.x * radius, cy + r.y * radius, 0.35 + depth * 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    if (reduced) {
      render();
      return () => ro.disconnect();
    }

    const loop = () => {
      angle += 0.0034;
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}
