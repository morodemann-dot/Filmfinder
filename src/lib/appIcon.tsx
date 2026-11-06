import { ImageResponse } from "next/og";

// App-Symbol: großer, leuchtender Funken (= "etwas Neues entdecken") auf tiefem Schwarz.
// iOS rundet die Ecken selbst ab – darum hier ein volles Quadrat ohne Transparenz.

const SPARK = "M50 4 C53.5 33 67 46.5 96 50 C67 53.5 53.5 67 50 96 C46.5 67 33 53.5 4 50 C33 46.5 46.5 33 50 4 Z";

export function renderAppIcon(size: number) {
  const s = size;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 42%, #3a2408 0%, #140c03 38%, #000000 75%)",
        }}
      >
        <svg width={s * 0.62} height={s * 0.62} viewBox="0 0 100 100" style={{ position: "absolute", left: s * 0.17, top: s * 0.17 }}>
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffd27a" />
              <stop offset="45%" stopColor="#ff9f0a" />
              <stop offset="100%" stopColor="#ff5e00" />
            </linearGradient>
          </defs>
          <path d={SPARK} fill="url(#g)" />
        </svg>
        <svg width={s * 0.2} height={s * 0.2} viewBox="0 0 100 100" style={{ position: "absolute", left: s * 0.7, top: s * 0.1 }}>
          <path d={SPARK} fill="#ffe2a8" />
        </svg>
        <svg width={s * 0.11} height={s * 0.11} viewBox="0 0 100 100" style={{ position: "absolute", left: s * 0.16, top: s * 0.72 }}>
          <path d={SPARK} fill="#ffb340" opacity={0.85} />
        </svg>
      </div>
    ),
    { width: s, height: s },
  );
}
