"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";

const DURATION_MS = 900;

/** Ease-out cubic: quick start, soft landing, like the gauge arc. */
function ease(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * A whole number that counts up from 0 to `value` when it mounts, and from the number on screen
 * to the new value when `value` changes. The server renders the final number; reduced motion
 * shows it straight away. Give the parent a `key` to replay the count from 0.
 */
export function CountUp({ value, className, style, accessibleLabel }: { value: number; className?: string; style?: CSSProperties; accessibleLabel?: string }) {
  const node = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    const show = (n: number) => {
      from.current = n;
      el.textContent = String(n);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      show(value);
      return;
    }
    let frame = 0;
    const origin = from.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      show(Math.round(origin + (value - origin) * ease(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    show(origin);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = String(from.current);
    };
  }, [value]);
  // The server and first paint carry the final number; the effect takes over the text from there.
  return (
    <>
      <span aria-hidden="true" ref={node} className={className} style={style} data-count-to={value}>
        {value}
      </span>
      <span className="sr-only">{accessibleLabel ?? value}</span>
    </>
  );
}
