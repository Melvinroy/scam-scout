import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 32,
        height: 32,
        background: "linear-gradient(145deg, #ff5a36, #4f46e5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
      }}
    >
      <div style={{ width: 12, height: 14, background: "#ffffff", borderRadius: 6, display: "flex" }} />
    </div>,
    size,
  );
}
