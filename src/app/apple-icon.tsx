import { ImageResponse } from "next/og";

// Symbol für den iPhone-Home-Bildschirm.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "#0f0d0c", color: "#f0a63a", fontSize: 120, fontWeight: 700, fontFamily: "Georgia, serif",
        }}
      >
        F
      </div>
    ),
    size,
  );
}
