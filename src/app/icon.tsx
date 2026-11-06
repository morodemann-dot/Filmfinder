import { ImageResponse } from "next/og";

// App-Symbol, automatisch erzeugt: ein "F" auf dunklem Grund.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "#0f0d0c", color: "#f0a63a", fontSize: 340, fontWeight: 700, fontFamily: "Georgia, serif",
        }}
      >
        F
      </div>
    ),
    size,
  );
}
