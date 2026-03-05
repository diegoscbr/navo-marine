"use client";

import { useRef, useEffect, useCallback } from "react";

const WAVE_LAYERS = [
  { angle: 0, freq: 0.015, speed: 0.4, amp: 1.0 },
  { angle: Math.PI / 3, freq: 0.012, speed: 0.3, amp: 0.8 },
  { angle: (2 * Math.PI) / 3, freq: 0.018, speed: 0.35, amp: 0.7 },
  { angle: Math.PI / 4, freq: 0.01, speed: 0.25, amp: 0.6 },
] as const;

const RES_SCALE = 0.5;
const SHARPNESS = 5.5;
const MAX_BRIGHTNESS = 0.28;
const MOUSE_LERP = 0.05;
const HOTSPOT_RADIUS = 200;
const FRAME_INTERVAL = 1000 / 30;

// Precompute trig values for wave layers
const WAVE_COS = WAVE_LAYERS.map((w) => Math.cos(w.angle));
const WAVE_SIN = WAVE_LAYERS.map((w) => Math.sin(w.angle));

type Props = {
  className?: string;
};

export function UnderwaterCaustics({ className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const imageDataRef = useRef<ImageData | null>(null);
  const mouseRef = useRef({
    currentX: 0.5,
    currentY: 0.5,
    targetX: 0.5,
    targetY: 0.5,
  });
  const sizeRef = useRef({ w: 0, h: 0 });
  const lastFrameRef = useRef(0);

  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current.targetX = (clientX - rect.left) / rect.width;
    mouseRef.current.targetY = (clientY - rect.top) / rect.height;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let paused = false;

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      const w = Math.floor(parent.clientWidth * RES_SCALE);
      const h = Math.floor(parent.clientHeight * RES_SCALE);
      if (w === sizeRef.current.w && h === sizeRef.current.h) return;
      sizeRef.current = { w, h };
      canvas!.width = w;
      canvas!.height = h;
      imageDataRef.current = ctx!.createImageData(w, h);
    }

    function renderFrame(time: number) {
      const { w, h } = sizeRef.current;
      const imageData = imageDataRef.current;
      if (!imageData || w === 0 || h === 0) return;

      const mouse = mouseRef.current;
      mouse.currentX += (mouse.targetX - mouse.currentX) * MOUSE_LERP;
      mouse.currentY += (mouse.targetY - mouse.currentY) * MOUSE_LERP;

      const data = imageData.data;
      const hotspotX = mouse.currentX * w;
      const hotspotY = mouse.currentY * h;
      const hotspotR = HOTSPOT_RADIUS * RES_SCALE;
      const hotspotRSq = hotspotR * hotspotR;
      const t = time * 0.001;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0;
          for (let i = 0; i < WAVE_LAYERS.length; i++) {
            const wave = WAVE_LAYERS[i];
            const phaseShift =
              (mouse.currentX - 0.5) * 2 * wave.amp +
              (mouse.currentY - 0.5) * 1.5 * wave.amp;
            const proj = x * WAVE_COS[i] + y * WAVE_SIN[i];
            sum +=
              Math.sin(proj * wave.freq + t * wave.speed + phaseShift) *
              wave.amp;
          }

          const norm = (sum / 3.1 + 1) / 2;
          let brightness = Math.pow(norm, SHARPNESS) * MAX_BRIGHTNESS;

          const dx = x - hotspotX;
          const dy = y - hotspotY;
          const distSq = dx * dx + dy * dy;
          if (distSq < hotspotRSq) {
            const hotspotFactor = 1 - Math.sqrt(distSq) / hotspotR;
            brightness += hotspotFactor * 0.08;
          }

          const idx = (y * w + x) * 4;
          data[idx] = 30;
          data[idx + 1] = 110;
          data[idx + 2] = 255;
          data[idx + 3] = Math.min(brightness * 255, 255) | 0;
        }
      }

      ctx!.putImageData(imageData, 0, 0);
    }

    function loop(timestamp: number) {
      if (paused) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      if (timestamp - lastFrameRef.current >= FRAME_INTERVAL) {
        lastFrameRef.current = timestamp;
        renderFrame(timestamp);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    function onVisibilityChange() {
      paused = document.hidden;
    }

    function onMotionChange() {
      if (prefersReducedMotion.matches) {
        cancelAnimationFrame(rafRef.current);
        resize();
        renderFrame(0);
      }
    }

    const onMouseMove = (e: MouseEvent) =>
      handlePointerMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) handlePointerMove(touch.clientX, touch.clientY);
    };

    // Debounced resize
    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 200);
    };

    resize();

    if (prefersReducedMotion.matches) {
      renderFrame(0);
    } else {
      rafRef.current = requestAnimationFrame(loop);
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("resize", onResize);
    prefersReducedMotion.addEventListener("change", onMotionChange);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(resizeTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", onResize);
      prefersReducedMotion.removeEventListener("change", onMotionChange);
    };
  }, [handlePointerMove]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      role="presentation"
      className={`pointer-events-none ${className}`}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
