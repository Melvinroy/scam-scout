"use client";

import { useEffect } from "react";
import { useWorld } from "@/lib/state/stores";

export function WorldDriver() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const env = process.env.NEXT_PUBLIC_WORLD_MODE;
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    useWorld.getState().setReduced(Boolean(reduced || env === "static"));
    if (env === "2d" || env === "static" || !gl) useWorld.getState().setMode("2d");
    else useWorld.getState().setMode("3d");
    let frame = 0;
    let last = performance.now();
    let alive = true;
    const loop = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!document.hidden) useWorld.getState().step(dt);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
