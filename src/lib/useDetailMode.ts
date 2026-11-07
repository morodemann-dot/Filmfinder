"use client";

import { useSyncExternalStore } from "react";
import { DETAIL_KEY } from "./aspects";

// "Ausführlich bewerten" an/aus – auf diesem Gerät gemerkt
const EVENT = "ff-detail-change";
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener(EVENT, cb); };
}
function read() {
  try { return localStorage.getItem(DETAIL_KEY) === "1"; } catch { return false; }
}
export function useDetailMode(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = (v: boolean) => {
    try { localStorage.setItem(DETAIL_KEY, v ? "1" : "0"); } catch {}
    window.dispatchEvent(new Event(EVENT));
  };
  return [on, set];
}
