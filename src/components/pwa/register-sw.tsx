"use client";

import { useEffect } from "react";

/**
 * Registers the service worker once in the browser. We do this as a Client
 * Component rather than an inline script so the code is typed and reviewed.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[sw] registration failed", err);
    });
  }, []);
  return null;
}
