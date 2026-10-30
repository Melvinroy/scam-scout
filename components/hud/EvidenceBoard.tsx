"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EvidenceMap } from "@/components/hud/EvidenceMap";
import { Scorecard } from "@/components/hud/Scorecard";
import type { PublicCase } from "@/lib/ui/public-evidence";

export function EvidenceBoard({ item }: { item: PublicCase }) {
  const [open, setOpen] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      opener?.focus();
      document.body.style.overflow = previous;
    };
  }, [open]);

  const drawer = open ? (
    <>
      <dialog ref={dialogRef} className="file-drawer file-drawer-board" aria-labelledby="memo-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p id="memo-title" className="text-sm font-semibold text-iris">Scorecard and evidence</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button>
        </div>
        <Scorecard key={item.id} item={item} />
        <EvidenceMap key={item.id} item={item} />
        <section className="memo-slip mt-4" aria-label="Full memo">
          <h3 className="text-sm font-semibold text-ink">Full memo</h3>
          {item.memo.map((paragraph) => (
            <p key={paragraph.slice(0, 48)} className="mt-2 text-sm leading-relaxed text-muted">{paragraph}</p>
          ))}
          <ul className="mt-3 grid gap-1">
            {item.nodes.map((node) => (
              <li key={node.id}>
                <span className="text-sm text-iris">
                  {node.source}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </dialog>
    </>
  ) : null;

  return (
    <>
      <div className="score-wrap">
        <Scorecard key={item.id} item={item} dense />
        <button type="button" className="btn btn-primary score-open" onClick={() => setOpen(true)}>
          Full memo
        </button>
      </div>
      {open && typeof document !== "undefined" ? createPortal(drawer, document.body) : null}
    </>
  );
}
