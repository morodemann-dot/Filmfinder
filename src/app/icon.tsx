import { renderAppIcon } from "@/lib/appIcon";

// App-Symbol (z. B. für Android und Browser-Tabs)
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return renderAppIcon(512);
}
