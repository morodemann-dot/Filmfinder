import { renderAppIcon } from "@/lib/appIcon";

// Symbol für den iPhone-Home-Bildschirm
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderAppIcon(180);
}
