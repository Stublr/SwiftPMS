import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.js";
import { initAuthListener } from "./services/auth.js";
import "./styles/globals.css";

// Initialize Firebase auth state listener
initAuthListener();

// Register the PWA service worker so staff can install to the home screen
// on Android. Disabled on localhost dev to avoid stale-cache surprises.
if (
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  window.location.hostname !== "localhost"
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Silent — SW is best-effort
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
