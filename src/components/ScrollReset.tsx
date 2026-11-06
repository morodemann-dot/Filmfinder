"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Beim Seitenwechsel wieder nach oben scrollen (der Inhalt scrollt in einem eigenen Bereich).
export default function ScrollReset() {
  const path = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    document.querySelector(".scroller")?.scrollTo({ top: 0 });
  }, [path, params]);
  return null;
}
