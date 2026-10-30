import { ImageResponse } from "next/og";
import { getReplay } from "@/lib/replay/cache";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const replay = await getReplay(id);
  const level = replay?.report.verdict.level ?? "Case";
  const color = level === "High" ? "#FF4D6D" : level === "Medium" ? "#FFB547" : "#2BD99F";
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#06080C", color: "#E9EEF5", padding: 64 }}>
      <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: "#3BE3FF" }}>SCAM SCOUT</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 72 }}>{replay?.label ?? "Recorded case"}</div>
        <div style={{ display: "flex", fontSize: 42, color, marginTop: 16 }}>{level}</div>
      </div>
      <div style={{ display: "flex", fontSize: 22, color: "#8A96A8" }}>Decision support only — not a determination of fraud.</div>
    </div>,
    size,
  );
}
