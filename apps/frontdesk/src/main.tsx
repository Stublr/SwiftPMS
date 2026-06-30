import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.js";
import { initAuthListener } from "./services/auth.js";
import "./styles/globals.css";

// Initialize Firebase auth state listener
initAuthListener();

// Register the PWA service worker so staff can install to the home screen
// on Android. Disabled on localhost dev to avoid stale-cache surprises.
//
// Update flow: when a new SW takes control (deploy with bumped CACHE_NAME
// in sw.js), reload the page once so staff see the new JS instead of the
// previously-cached bundle.
if (
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  window.location.hostname !== "localhost"
) {
  let reloadGuard = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadGuard) return;
    reloadGuard = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Poll for updates every 60s while the tab is open so a deploy
        // that landed mid-session gets picked up promptly.
        setInterval(() => {
          reg.update().catch(() => {
            // Network blip — try again next tick
          });
        }, 60_000);
      })
      .catch(() => {
        // Silent — SW is best-effort
      });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
